const express = require('express');
const cors = require('cors');
const mqtt = require('mqtt');
const path = require('path');
const { dialogflow } = require('actions-on-google');
require('dotenv').config();

// Initialize Dialogflow app
const dialogflowApp = dialogflow({ debug: true });

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
        roomLight: process.env.MQTT_TOPIC_ROOM_LIGHT,
        readingLamp: process.env.MQTT_TOPIC_READING_LAMP,
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

// Dialogflow webhook endpoint
app.post('/api/fulfillment', dialogflowApp);

// Dialogflow intents
dialogflowApp.intent('devicecontrol', async (conv, { devicename, devicestatus }) => {
    if (!mqttClient || !mqttClient.connected) {
        conv.ask("Sorry, the smart home system is not connected right now.");
        return;
    }

    try {
        let topic, message;

        switch(devicename.toLowerCase()) {
            case 'fan':
                topic = mqttConfig.topics.fan;
                message = JSON.stringify({ state: devicestatus.toLowerCase() === 'on' ? 'on' : 'off' });
                break;
            case 'room light':
            case 'room':
                topic = mqttConfig.topics.roomLight;
                message = JSON.stringify({ state: devicestatus.toLowerCase() === 'on' ? 'on' : 'off' });
                break;
            case 'reading light':
            case 'lamp':
                topic = mqttConfig.topics.readingLamp;
                message = JSON.stringify({ state: devicestatus.toLowerCase() === 'on' ? 'on' : 'off' });
                break;
            case 'door':
                topic = mqttConfig.topics.doorServo;
                message = JSON.stringify({ command: devicestatus.toLowerCase() === 'open' ? 'open' : 'close' });
                break;
            case 'curtain':
                topic = mqttConfig.topics.curtainServo;
                message = JSON.stringify({ command: devicestatus.toLowerCase() === 'open' ? 'open' : 'close' });
                break;
            default:
                conv.ask(`I don't know how to control the ${devicename}`);
                return;
        }

        await new Promise((resolve, reject) => {
            mqttClient.publish(topic, message, { qos: 1 }, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Confirm the action
        if (devicename === 'door' || devicename === 'curtain') {
            conv.ask(`I've ${devicestatus} the ${devicename}`);
        } else {
            conv.ask(`I've turned ${devicestatus} the ${devicename}`);
        }

    } catch (error) {
        console.error('Error controlling device:', error);
        conv.ask("Sorry, I couldn't control the device. Please try again.");
    }
});

// Device status intent
dialogflowApp.intent('devicestatus', (conv, { devicename }) => {
    if (!mqttClient || !mqttClient.connected) {
        conv.ask("Sorry, the smart home system is not connected right now.");
        return;
    }

    // You would need to implement device status tracking in your system
    conv.ask(`I'm sorry, I can't check the status of the ${devicename} yet.`);
});

// Fan control endpoint
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

// Door servo control endpoint
app.post('/api/device/servo/door', (req, res) => {
    if (!mqttClient || !mqttClient.connected) {
        return res.status(503).json({ error: 'MQTT client is not connected' });
    }

    const { command } = req.body;
    
    if (!command || !['open', 'close'].includes(command)) {
        return res.status(400).json({ error: 'Command must be either "open" or "close"' });
    }

    const message = JSON.stringify({ command });
    mqttClient.publish(mqttConfig.topics.doorServo, message, { qos: 1 }, (err) => {
        if (err) {
            console.error('Error publishing door servo command:', err);
            res.status(500).json({ error: 'Failed to control door servo' });
        } else {
            console.log(`Published door servo command: ${message}`);
            res.json({ success: true });
        }
    });
});

// Curtain servo control endpoint
app.post('/api/device/servo/curtain', (req, res) => {
    if (!mqttClient || !mqttClient.connected) {
        return res.status(503).json({ error: 'MQTT client is not connected' });
    }

    const { command } = req.body;
    
    if (!command || !['open', 'close'].includes(command)) {
        return res.status(400).json({ error: 'Command must be either "open" or "close"' });
    }

    const message = JSON.stringify({ command });
    mqttClient.publish(mqttConfig.topics.curtainServo, message, { qos: 1 }, (err) => {
        if (err) {
            console.error('Error publishing curtain servo command:', err);
            res.status(500).json({ error: 'Failed to control curtain servo' });
        } else {
            console.log(`Published curtain servo command: ${message}`);
            res.json({ success: true });
        }
    });
});

// Room light control endpoint
app.post('/api/device/light/room', (req, res) => {
    if (!mqttClient || !mqttClient.connected) {
        return res.status(503).json({ error: 'MQTT client is not connected' });
    }

    const { state } = req.body;
    
    if (state === undefined || state === null) {
        return res.status(400).json({ error: 'State is required' });
    }

    const boolState = typeof state === 'string' ? state.toLowerCase() === 'true' : Boolean(state);
    const message = JSON.stringify({ state: boolState });
    
    mqttClient.publish(mqttConfig.topics.roomLight, message, { qos: 1 }, (err) => {
        if (err) {
            console.error('Error publishing room light message:', err);
            res.status(500).json({ error: 'Failed to control room light' });
        } else {
            console.log(`Published room light message: ${message}`);
            res.json({ success: true });
        }
    });
});

// Reading lamp control endpoint
app.post('/api/device/light/reading', (req, res) => {
    if (!mqttClient || !mqttClient.connected) {
        return res.status(503).json({ error: 'MQTT client is not connected' });
    }

    const { state } = req.body;
    
    if (state === undefined || state === null) {
        return res.status(400).json({ error: 'State is required' });
    }

    const boolState = typeof state === 'string' ? state.toLowerCase() === 'true' : Boolean(state);
    const message = JSON.stringify({ state: boolState });
    
    mqttClient.publish(mqttConfig.topics.readingLamp, message, { qos: 1 }, (err) => {
        if (err) {
            console.error('Error publishing reading lamp message:', err);
            res.status(500).json({ error: 'Failed to control reading lamp' });
        } else {
            console.log(`Published reading lamp message: ${message}`);
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
