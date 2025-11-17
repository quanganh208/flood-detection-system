"""
PlatformIO Builder wrapper class
Handles build process execution and output streaming
"""
import subprocess
import threading
import time
import hashlib
import re
import logging
from pathlib import Path
from typing import Generator, Optional, Dict, Any
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)


class BuildPhase(Enum):
    """Build phases"""
    INITIALIZING = "initializing"
    DOWNLOADING = "downloading"
    INSTALLING = "installing"
    COMPILING = "compiling"
    LINKING = "linking"
    PACKAGING = "packaging"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class BuildStatus:
    """Current build status"""
    phase: BuildPhase
    progress: int  # 0-100
    message: str
    timestamp: float


class PlatformIOBuilder:
    """Wrapper for PlatformIO CLI build process"""

    # Regex patterns to detect build phases
    PHASE_PATTERNS = {
        BuildPhase.DOWNLOADING: [
            r"Downloading",
            r"Download\s+\[",
        ],
        BuildPhase.INSTALLING: [
            r"Installing",
            r"UnpackingPackage",
            r"PackageManager:",
        ],
        BuildPhase.COMPILING: [
            r"Compiling\s+\.pio",
            r"Building\s+\.pio",
            r"Archiving",
        ],
        BuildPhase.LINKING: [
            r"Linking",
            r"Generating",
        ],
        BuildPhase.PACKAGING: [
            r"Building\s+\.pio.*firmware\.bin",
            r"Creating\s+BIN",
        ],
    }

    def __init__(self, build_dir: Path, timeout: int = 600):
        """
        Initialize builder

        Args:
            build_dir: Directory containing project files
            timeout: Maximum build time in seconds
        """
        self.build_dir = build_dir
        self.timeout = timeout
        self.process: Optional[subprocess.Popen] = None
        self.current_status = BuildStatus(
            phase=BuildPhase.INITIALIZING,
            progress=0,
            message="Initializing build",
            timestamp=time.time()
        )
        self._stop_event = threading.Event()

    def detect_phase(self, line: str) -> Optional[BuildPhase]:
        """
        Detect build phase from output line

        Args:
            line: Output line from PlatformIO

        Returns:
            Detected build phase or None
        """
        for phase, patterns in self.PHASE_PATTERNS.items():
            for pattern in patterns:
                if re.search(pattern, line, re.IGNORECASE):
                    return phase
        return None

    def calculate_progress(self, phase: BuildPhase, line: str) -> int:
        """
        Calculate progress percentage based on phase and output

        Args:
            phase: Current build phase
            line: Output line

        Returns:
            Progress percentage (0-100)
        """
        # Base progress for each phase
        phase_progress = {
            BuildPhase.INITIALIZING: 0,
            BuildPhase.DOWNLOADING: 10,
            BuildPhase.INSTALLING: 20,
            BuildPhase.COMPILING: 40,
            BuildPhase.LINKING: 80,
            BuildPhase.PACKAGING: 90,
            BuildPhase.COMPLETED: 100,
        }

        base = phase_progress.get(phase, 0)

        # Try to extract percentage from line (e.g., "[50%]")
        match = re.search(r'\[(\d+)%\]', line)
        if match:
            percent = int(match.group(1))
            # Scale to phase range
            if phase == BuildPhase.COMPILING:
                # Compiling is 40-80%, so scale 0-100% to that range
                return base + int((80 - base) * percent / 100)

        return base

    def validate_project(self) -> tuple[bool, str]:
        """
        Validate project has required files

        Returns:
            (is_valid, error_message)
        """
        platformio_ini = self.build_dir / 'platformio.ini'
        if not platformio_ini.exists():
            return False, "Missing platformio.ini file"

        # Check for at least one source file
        source_files = list(self.build_dir.glob('*.cpp')) + \
                      list(self.build_dir.glob('*.ino')) + \
                      list(self.build_dir.glob('src/*.cpp')) + \
                      list(self.build_dir.glob('src/*.ino')) + \
                      list(self.build_dir.glob('src/*.c'))

        if not source_files:
            return False, "No source files (.cpp, .ino, .c) found"

        return True, ""

    def build(self) -> Generator[Dict[str, Any], None, None]:
        """
        Execute PlatformIO build and stream events

        Yields:
            SSE event dictionaries
        """
        # Validate project
        is_valid, error_msg = self.validate_project()
        if not is_valid:
            yield {
                'event': 'error',
                'data': {
                    'code': 'VALIDATION_ERROR',
                    'message': error_msg,
                    'timestamp': time.time()
                }
            }
            return

        # Start build
        yield {
            'event': 'build_started',
            'data': {
                'build_dir': str(self.build_dir.name),
                'timestamp': time.time()
            }
        }

        try:
            # Execute platformio run command
            cmd = ['platformio', 'run']

            logger.info(f"Starting build in {self.build_dir}")
            logger.info(f"Command: {' '.join(cmd)}")

            self.process = subprocess.Popen(
                cmd,
                cwd=str(self.build_dir),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                universal_newlines=True,
                bufsize=1
            )

            start_time = time.time()

            # Stream output line by line
            for line in iter(self.process.stdout.readline, ''):
                # Check for timeout
                if time.time() - start_time > self.timeout:
                    self.process.kill()
                    yield {
                        'event': 'error',
                        'data': {
                            'code': 'TIMEOUT',
                            'message': f'Build exceeded timeout of {self.timeout}s',
                            'timestamp': time.time()
                        }
                    }
                    return

                # Check for stop signal
                if self._stop_event.is_set():
                    self.process.kill()
                    yield {
                        'event': 'error',
                        'data': {
                            'code': 'CANCELLED',
                            'message': 'Build was cancelled',
                            'timestamp': time.time()
                        }
                    }
                    return

                line = line.strip()
                if not line:
                    continue

                # Emit log event
                yield {
                    'event': 'log',
                    'data': {
                        'line': line,
                        'timestamp': time.time()
                    }
                }

                # Detect phase change
                phase = self.detect_phase(line)
                if phase and phase != self.current_status.phase:
                    self.current_status.phase = phase
                    self.current_status.progress = self.calculate_progress(phase, line)
                    self.current_status.message = line
                    self.current_status.timestamp = time.time()

                    # Emit progress event
                    yield {
                        'event': 'progress',
                        'data': {
                            'phase': phase.value,
                            'progress': self.current_status.progress,
                            'message': line,
                            'timestamp': time.time()
                        }
                    }

            # Wait for process to complete
            return_code = self.process.wait()

            if return_code != 0:
                yield {
                    'event': 'error',
                    'data': {
                        'code': 'BUILD_FAILED',
                        'message': f'Build failed with exit code {return_code}',
                        'details': 'Check log output for details',
                        'timestamp': time.time()
                    }
                }
                return

            # Find firmware binary
            firmware_path = self.find_firmware()
            if not firmware_path:
                yield {
                    'event': 'error',
                    'data': {
                        'code': 'FIRMWARE_NOT_FOUND',
                        'message': 'Build succeeded but firmware.bin not found',
                        'timestamp': time.time()
                    }
                }
                return

            # Calculate MD5 hash
            md5_hash = self.calculate_md5(firmware_path)
            file_size = firmware_path.stat().st_size

            # Copy firmware to build root for easy access
            output_path = self.build_dir / 'firmware.bin'
            output_path.write_bytes(firmware_path.read_bytes())

            logger.info(f"Build completed successfully: {output_path}")

            # Emit success event
            yield {
                'event': 'build_complete',
                'data': {
                    'build_id': self.build_dir.name,
                    'firmware_url': f'/download/{self.build_dir.name}',
                    'size': file_size,
                    'md5': md5_hash,
                    'timestamp': time.time()
                }
            }

        except Exception as e:
            logger.error(f"Build error: {str(e)}", exc_info=True)
            yield {
                'event': 'error',
                'data': {
                    'code': 'INTERNAL_ERROR',
                    'message': str(e),
                    'timestamp': time.time()
                }
            }

    def find_firmware(self) -> Optional[Path]:
        """
        Find compiled firmware binary

        Returns:
            Path to firmware.bin or None
        """
        # Common locations
        search_paths = [
            self.build_dir / '.pio' / 'build' / 'esp32dev' / 'firmware.bin',
            self.build_dir / '.pio' / 'build' / 'esp32' / 'firmware.bin',
            self.build_dir / '.pio' / 'build' / '*' / 'firmware.bin',
        ]

        for pattern in search_paths:
            if '*' in str(pattern):
                matches = list(self.build_dir.glob(str(pattern.relative_to(self.build_dir))))
                if matches:
                    return matches[0]
            elif pattern.exists():
                return pattern

        return None

    def calculate_md5(self, file_path: Path) -> str:
        """
        Calculate MD5 hash of file

        Args:
            file_path: Path to file

        Returns:
            MD5 hash as hex string
        """
        md5 = hashlib.md5()
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(4096), b''):
                md5.update(chunk)
        return md5.hexdigest()

    def cancel(self):
        """Cancel running build"""
        self._stop_event.set()
        if self.process and self.process.poll() is None:
            logger.info(f"Cancelling build in {self.build_dir}")
            self.process.kill()
