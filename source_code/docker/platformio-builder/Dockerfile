# PlatformIO Builder Service Dockerfile
# Multi-stage build for optimized image size

FROM python:3.11-slim as base

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m -u 1000 builder && \
    mkdir -p /builds /app && \
    chown -R builder:builder /builds /app

# Set working directory
WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Install PlatformIO CLI
RUN pip install --no-cache-dir platformio

# Pre-download common ESP32 platform (optional, speeds up first build)
# This is commented out to reduce image size, but uncomment for faster first builds
# RUN platformio platform install espressif32

# Copy application code with correct ownership
COPY --chown=builder:builder config.py builder.py app.py ./

# Switch to non-root user
USER builder

# Create PlatformIO home directory
RUN mkdir -p /home/builder/.platformio

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5000/health || exit 1

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV BUILDS_DIR=/builds
ENV PLATFORMIO_CORE_DIR=/home/builder/.platformio

# Run application
CMD ["python", "app.py"]
