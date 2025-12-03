# Flood Detection System

An IoT-based flood detection and early warning system using ESP32 sensors, real-time monitoring via MQTT, and web/mobile interfaces.

[![NestJS](https://img.shields.io/badge/NestJS-11.0-E0234E?logo=nestjs)](https://nestjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql)](https://www.postgresql.org/)
[![MQTT](https://img.shields.io/badge/MQTT-Mosquitto-3C5280?logo=eclipsemosquitto)](https://mosquitto.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker)](https://www.docker.com/)
[![ESP32](https://img.shields.io/badge/ESP32-PlatformIO-FF6900?logo=platformio)](https://platformio.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## Overview

This system monitors water levels and rainfall using ESP32-based IoT devices, processes sensor data in real-time, and provides alerts for potential flood conditions. It features OTA (Over-The-Air) firmware updates, a web-based firmware builder, device management dashboard, and a mobile application for field monitoring.

### Key Features

- **Real-time Monitoring**: Continuous sensor data collection via MQTT protocol
- **Automatic Device Registration**: ESP32 devices auto-register on first connection
- **OTA Firmware Updates**: Remote firmware deployment with rollback capability
- **Web-based Firmware Builder**: Compile and deploy ESP32 firmware from browser
- **Alert System**: Automatic alerts based on configurable thresholds
- **Mobile App**: Android application for field monitoring and alerts
- **REST API**: Complete API with Swagger documentation

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                               │
├─────────────────────────┬───────────────────┬──────────────────────┤
│  Web Dashboard          │  Mobile App       │  ESP32 Devices       │
│  - Firmware Builder     │  (Android/Kotlin) │  - Rain Sensors      │
│  - Device Management    │  - Map View       │  - Water Sensors     │
│  - OTA Management       │  - Alerts         │  - WiFi + MQTT       │
└──────────┬──────────────┴─────────┬─────────┴──────────┬───────────┘
           │ HTTP/REST              │ HTTP/REST          │ MQTT
           │                        │                    │
┌──────────▼────────────────────────▼────────────────────▼───────────┐
│                      APPLICATION LAYER                             │
│  NestJS Server (Port 3000)                                         │
│  ┌─────────────┬─────────────┬─────────────┬─────────────────────┐ │
│  │ Devices API │ Firmware    │ OTA API     │ Mobile API          │ │
│  │             │ Builder API │             │                     │ │
│  └─────────────┴─────────────┴─────────────┴─────────────────────┘ │
└────────────┬────────────────────────────────┬──────────────────────┘
             │                                │
┌────────────▼────────────────┐  ┌────────────▼──────────────────────┐
│  DATA LAYER                 │  │  BUILDER SERVICE                  │
│  PostgreSQL + MQTT Broker   │  │  PlatformIO Builder (Flask)       │
└─────────────────────────────┘  └───────────────────────────────────┘
```

## Tech Stack

| Layer            | Technology                        |
| ---------------- | --------------------------------- |
| Backend          | NestJS 11, TypeScript, Prisma ORM |
| Database         | PostgreSQL 16                     |
| Message Broker   | Eclipse Mosquitto (MQTT)          |
| Firmware Builder | Python Flask, PlatformIO          |
| IoT Device       | ESP32, Arduino Framework          |
| Mobile           | Android (Kotlin), Jetpack Compose |
| Infrastructure   | Docker, Docker Compose            |

## Prerequisites

- [Docker](https://www.docker.com/) & Docker Compose
- [Node.js](https://nodejs.org/) 20+ (for local development)
- [PlatformIO](https://platformio.org/) (for ESP32 firmware development)
- [Android Studio](https://developer.android.com/studio) (for mobile app)

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/quanganh208/flood-detection-system.git
cd flood-detection-system
```

### 2. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/flood_detection

# MQTT Broker
MQTT_BROKER_URL=mqtt://localhost:1883

# Server
PORT=3000

# PlatformIO Builder
PLATFORMIO_BUILDER_URL=http://localhost:5001
```

### 3. Start with Docker Compose

```bash
# Development mode
docker-compose up -d

# Production mode
docker-compose -f docker-compose.prod.yml up -d
```

### 4. Access the Application

| Service           | URL                                 |
| ----------------- | ----------------------------------- |
| Web Dashboard     | http://localhost:3000               |
| API Documentation | http://localhost:3000/api/docs      |
| Firmware Builder  | http://localhost:3000/firmware.html |
| Device Management | http://localhost:3000/devices.html  |

## Project Structure

```
flood-detection-system/
├── server/                    # NestJS Backend
│   ├── src/
│   │   ├── devices/          # Device management module
│   │   ├── sensors/          # Sensor data processing
│   │   ├── firmware/         # Firmware builder integration
│   │   ├── ota/              # OTA update management
│   │   ├── mqtt/             # MQTT service
│   │   ├── mobile/           # Mobile API endpoints
│   │   └── prisma/           # Database ORM
│   ├── public/               # Static web files
│   └── prisma/
│       └── schema.prisma     # Database schema
├── esp32/                     # ESP32 Firmware
│   └── esp32.ino             # Main firmware code
├── Android/                   # Android Mobile App
│   └── app/                  # Kotlin source
├── docker/
│   └── platformio-builder/   # PlatformIO build service
├── docker-compose.yml        # Development configuration
├── docker-compose.prod.yml   # Production configuration
└── deploy.sh                 # Deployment script
```

## API Reference

Full API documentation is available at `/api/docs` (Swagger UI).

### Main Endpoints

#### Devices

| Method | Endpoint             | Description           |
| ------ | -------------------- | --------------------- |
| GET    | `/api/devices`       | List all devices      |
| GET    | `/api/devices/stats` | Get device statistics |
| GET    | `/api/devices/:id`   | Get device details    |
| PATCH  | `/api/devices/:id`   | Update device         |
| DELETE | `/api/devices/:id`   | Delete device         |

#### Firmware

| Method | Endpoint                         | Description                 |
| ------ | -------------------------------- | --------------------------- |
| POST   | `/api/firmware/build/init`       | Initialize firmware build   |
| GET    | `/api/firmware/build/:id/stream` | Stream build progress (SSE) |
| GET    | `/api/firmware`                  | List all firmwares          |
| POST   | `/api/firmware/:id/promote`      | Promote to latest           |

#### OTA Updates

| Method | Endpoint                     | Description       |
| ------ | ---------------------------- | ----------------- |
| GET    | `/api/ota/check/:deviceId`   | Check for updates |
| GET    | `/api/ota/download/:buildId` | Download firmware |
| POST   | `/api/ota/verify/:deviceId`  | Verify update     |

#### Mobile

| Method | Endpoint                         | Description            |
| ------ | -------------------------------- | ---------------------- |
| GET    | `/api/mobile/map-data`           | Get map data with ETag |
| GET    | `/api/mobile/alerts`             | Get active alerts      |
| PATCH  | `/api/mobile/alerts/:id/resolve` | Resolve alert          |

## MQTT Topics

```
flood/{deviceId}/sensor    # Sensor readings (ESP32 → Server)
flood/{deviceId}/status    # Device status/heartbeat
flood/{deviceId}/config    # Configuration updates (Server → ESP32)
flood/{deviceId}/ota       # OTA notifications
flood/broadcast/ota        # Broadcast OTA to all devices
```

### Sensor Message Format

```json
{
  "rain": 45.5,
  "waterLevel": 12.3,
  "timestamp": "2025-01-15T10:30:00Z"
}
```

## ESP32 Setup

### Hardware Requirements

- ESP32 Development Board
- Rain Sensor (analog output)
- Water Level Sensor (analog output)
- Power Supply (5V USB or battery)

### Pin Configuration

| Component          | GPIO Pin           |
| ------------------ | ------------------ |
| Rain Sensor        | GPIO 34 (ADC1_CH6) |
| Water Level Sensor | GPIO 35 (ADC1_CH7) |
| Status LED         | GPIO 2 (Built-in)  |

### Flashing Firmware

**Option 1: Web Builder (Recommended)**

1. Navigate to http://localhost:3000/firmware.html
2. Upload your customized `esp32.ino`
3. Click "Build"
4. Download the compiled `.bin` file
5. Flash using OTA or USB

**Option 2: PlatformIO CLI**

```bash
cd esp32
pio run --target upload
```

### ESP32 Serial Commands

Connect via Serial Monitor (115200 baud):

| Command            | Description                   |
| ------------------ | ----------------------------- |
| `status`           | Display current device status |
| `ota`              | Trigger OTA update check      |
| `reset`            | Restart device                |
| `setmqtt <broker>` | Set MQTT broker URL           |
| `setserver <url>`  | Set server URL                |
| `clearnvs`         | Clear stored settings         |

## Development

### Local Development (Without Docker)

```bash
# Install dependencies
cd server
npm install

# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate dev

# Start development server
npm run start:dev
```

### Available Scripts

```bash
npm run start:dev      # Development with hot reload
npm run build          # Build for production
npm run start:prod     # Run production build
npm run lint           # Run ESLint
npm run format         # Format with Prettier
npm run type-check     # TypeScript type checking
```

### Database Management

```bash
# Create migration
npx prisma migrate dev --name <migration_name>

# Reset database
npx prisma migrate reset

# Open Prisma Studio
npx prisma studio
```

## Deployment

### Using Deploy Script

```bash
chmod +x deploy.sh
./deploy.sh
```

### Manual Docker Deployment

```bash
# Build and start production containers
docker-compose -f docker-compose.prod.yml build
docker-compose -f docker-compose.prod.yml up -d

# View logs
docker-compose -f docker-compose.prod.yml logs -f

# Stop services
docker-compose -f docker-compose.prod.yml down
```

### Environment Variables (Production)

| Variable                 | Description                  | Default                          |
| ------------------------ | ---------------------------- | -------------------------------- |
| `DATABASE_URL`           | PostgreSQL connection string | Required                         |
| `MQTT_BROKER_URL`        | MQTT broker URL              | `mqtt://mosquitto:1883`          |
| `PLATFORMIO_BUILDER_URL` | PlatformIO builder URL       | `http://platformio-builder:5001` |
| `PORT`                   | Server port                  | `3000`                           |
| `NODE_ENV`               | Environment                  | `production`                     |

## Mobile App

The Android app provides field monitoring capabilities.

### Features

- Real-time device map view
- Sensor data visualization
- Push notifications for alerts
- Offline data caching

### Building the App

```bash
cd Android
./gradlew assembleDebug
```

APK location: `Android/app/build/outputs/apk/debug/app-debug.apk`

## Database Schema

### Main Entities

- **Device**: IoT device information and status
- **SensorReading**: Historical sensor data
- **Alert**: Flood warnings and notifications
- **Firmware**: Compiled firmware versions
- **OTAUpdate**: Update deployment tracking

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style

- TypeScript with ESLint + Prettier
- Conventional Commits for commit messages
- Husky pre-commit hooks for linting

## Troubleshooting

### Common Issues

**Docker containers won't start**

```bash
# Check logs
docker-compose logs -f

# Reset everything
docker-compose down -v
docker-compose up -d
```

**Database connection failed**

```bash
# Verify PostgreSQL is running
docker-compose ps

# Check connection string in .env
```

**MQTT connection issues**

```bash
# Test MQTT broker
mosquitto_pub -h localhost -t test -m "hello"
mosquitto_sub -h localhost -t test
```

**ESP32 not connecting**

- Check WiFi credentials in WiFiManager portal
- Verify MQTT broker is accessible from device network
- Check serial output for error messages

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [NestJS](https://nestjs.com/) - Progressive Node.js framework
- [PlatformIO](https://platformio.org/) - Professional embedded development
- [Eclipse Mosquitto](https://mosquitto.org/) - MQTT broker
- [Prisma](https://www.prisma.io/) - Next-generation ORM
