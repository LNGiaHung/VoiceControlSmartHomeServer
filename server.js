const express = require('express');
const cors = require('cors');
const mqtt = require('mqtt');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
let mqttClient = null;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// MQTT Configuration
const mqttConfig = {
    broker: process.env.MQTT_BROKER,
    port: Number(process.env.MQTT_PORT),
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    topics: {
        fan: process.env.MQTT_TOPIC_FAN,
        doorServo: process.env.MQTT_TOPIC_DOOR_SERVO,
        curtainServo: process.env.MQTT_TOPIC_CURTAIN_SERVO,
        status: process.env.MQTT_TOPIC_STATUS,
    },
};

// Connect to MQTT broker
function connectMQTT() {
    if (mqttClient) {
        mqttClient.end();
    }

    console.log(`Connecting to MQTT broker: ${mqttConfig.broker}`);

    mqttClient = mqtt.connect(mqttConfig.broker, {
        port: mqttConfig.port,
        clientId: `server_${Math.random().toString(16).slice(3)}`,
        username: mqttConfig.username,
        password: mqttConfig.password,
        keepalive: 60,
        clean: true,
        reconnectPeriod: 5000,
        protocol: 'mqtts', // Secure MQTT over TLS
    });

    mqttClient.on('connect', () => {
        console.log('Connected to MQTT broker');
        
        // Subscribe to topics
        Object.values(mqttConfig.topics).forEach(topic => {
            mqttClient.subscribe(topic, (err) => {
                if (!err) {
                    console.log(`Subscribed to ${topic}`);
                } else {
                    console.error(`Failed to subscribe to ${topic}:`, err);
                }
            });
        });
    });
  
    mqttClient.on('error', (error) => {
        console.error('MQTT Error:', error);
    });
  
    mqttClient.on('message', (topic, message) => {
        console.log(`Received message on ${topic}: ${message.toString()}`);
    });
}

// Device control endpoints
app.post('/api/device/fan', (req, res) => {
    if (!mqttClient || !mqttClient.connected) {
        return res.status(503).json({ error: 'MQTT client is not connected' });
    }

    const { state } = req.body;
    
    if (state === undefined || state === null) {
        return res.status(400).json({ error: 'State is required' });
    }

    const boolState = typeof state === 'string' ? state.toLowerCase() === 'true' : Boolean(state);
    const message = JSON.stringify({ state: boolState });
    
    mqttClient.publish(mqttConfig.topics.fan, message, { qos: 1 }, (err) => {
        if (err) {
            console.error('Error publishing fan message:', err);
            res.status(500).json({ error: 'Failed to control fan' });
        } else {
            console.log(`Published fan message: ${message}`);
            res.json({ success: true });
        }
    });
});

app.post('/api/device/servo/door', (req, res) => {
    if (!mqttClient || !mqttClient.connected) {
        return res.status(503).json({ error: 'MQTT client is not connected' });
    }

    const { angle } = req.body;
    
    if (angle === undefined || angle === null) {
        return res.status(400).json({ error: 'Angle is required' });
    }

    const numAngle = Number(angle);
    if (isNaN(numAngle) || numAngle < 0 || numAngle > 180) {
        return res.status(400).json({ error: 'Angle must be a number between 0 and 180' });
    }

    const message = JSON.stringify({ angle: numAngle });
    mqttClient.publish(mqttConfig.topics.doorServo, message, { qos: 1 }, (err) => {
        if (err) {
            console.error('Error publishing door servo angle:', err);
            res.status(500).json({ error: 'Failed to control door servo' });
        } else {
            console.log(`Published door servo angle: ${numAngle}`);
            res.json({ success: true });
        }
    });
});

app.post('/api/device/servo/curtain', (req, res) => {
    if (!mqttClient || !mqttClient.connected) {
        return res.status(503).json({ error: 'MQTT client is not connected' });
    }

    const { angle } = req.body;
    
    if (angle === undefined || angle === null) {
        return res.status(400).json({ error: 'Angle is required' });
    }

    const numAngle = Number(angle);
    if (isNaN(numAngle) || numAngle < 0 || numAngle > 180) {
        return res.status(400).json({ error: 'Angle must be a number between 0 and 180' });
    }

    const message = JSON.stringify({ angle: numAngle });
    mqttClient.publish(mqttConfig.topics.curtainServo, message, { qos: 1 }, (err) => {
        if (err) {
            console.error('Error publishing curtain servo angle:', err);
            res.status(500).json({ error: 'Failed to control curtain servo' });
        } else {
            console.log(`Published curtain servo angle: ${numAngle}`);
            res.json({ success: true });
        }
    });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        mqttConnected: mqttClient ? mqttClient.connected : false,
        timestamp: new Date().toISOString(),
    });
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Handle process termination
process.on('SIGINT', () => {
    console.log('Shutting down...');
    mqttClient?.end();
    process.exit(0);
});

// Start server
connectMQTT();
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
