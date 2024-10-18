require('dotenv').config();  // Cargar las variables de entorno

const { Client } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');
const path = require('path');
const pausedUsers = {}; // Objeto para almacenar el estado pausado de cada usuario


// Verificar si la clave de API está configurada
if (!process.env.GEMINI_API_KEY) {
    throw new Error('La variable de entorno GEMINI_API_KEY no está configurada.');
}

// Inicializar Google Generative AI con la clave de API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

//leer laptops 
const laptopsFilePath = path.join(__dirname, 'Laptops1.txt');
let laptops = '';

try {
    laptops = fs.readFileSync(laptopsFilePath, 'utf8');
} catch (error) {
    console.error('Error leyendo el archivo de información de las laptops:', error);
}
// Leer el archivo con la información de la empresa
const companyInfoFilePath = path.join(__dirname, 'info_empresa.txt');
let companyInfo = '';

try {
    companyInfo = fs.readFileSync(companyInfoFilePath, 'utf8');
} catch (error) {
    console.error('Error leyendo el archivo de información de la empresa:', error);
}

// Leer el archivo promt.txt
let promptInstructions = '';

try {
    const promptFilePath = path.join(__dirname, 'promt.txt');
    promptInstructions = fs.readFileSync(promptFilePath, 'utf8');
} catch (error) {
    console.error('Error leyendo el archivo promt.txt:', error);
    promptInstructions = ''; // Si no se puede leer, se continúa sin instrucciones adicionales
}

// Crear un objeto para almacenar el contexto de cada usuario
const contextStore = {};

// Función para generar contenido basado en un prompt
async function generateResponse(userMessage, contactId) {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    try {
        // Recuperar el contexto existente o inicializarlo
        const userContext = contextStore[contactId] || '';

        // Combinar las instrucciones del archivo promt.txt con el mensaje del usuario y el contexto previo
        const customPrompt = `
        Eres un asistente virtual especializado en atender a los clientes de ElectronicsJS. Tus funciones principales incluyen:

        1. **Proporcionar Información de la Empresa:** Ofrecer detalles sobre ElectronicsJS, como misión, visión, valores, productos, ubicación, horarios de atención y políticas de la tienda.

        2. **Responder Solicitudes de Información:** Atender preguntas sobre los productos disponibles, incluyendo componentes y especificaciones de las laptops listadas.

        3. **Agendar Recordatorios:** Crear recordatorios para los clientes en un tiempo específico o en una fecha y hora concreta.

        4. **Verificar Horarios de Apertura:** Antes de responder preguntas sobre la tienda, verifica si está abierta según la zona horaria de Panamá.

        5. **Manejar Preguntas Generales:** Si recibes preguntas no relacionadas con ElectronicsJS, indica que solo puedes proporcionar información sobre la empresa y sus productos.

        6. **Respetar Privacidad:** No puedes divulgar información personal o sensible de los clientes ni información confidencial de la empresa.

        NOTA: Por el momento la opcion de recordatorios esta bloqueada, no se le mecionara al usuario.

        **Información de Referencia:**
        - **ElectronicsJS:** ${companyInfo}
        - **Laptops Disponibles:** ${laptops}
        - **Contexto del Usuario:** ${userContext}

        Responde de manera clara, directa y breve a la siguiente solicitud del cliente: "${userMessage}".
        `;


        const result = await model.generateContent(customPrompt);
        const response = await result.response;
        const text = response.text();

        // Actualizar el contexto del usuario
        contextStore[contactId] = `${userContext}\nUsuario: ${userMessage}\nBot: ${text}`;

        return text;
    } catch (error) {
        console.error('Error generando la respuesta:', error);
        return 'Lo siento, no pude procesar tu solicitud en este momento.';
    }
}

// Función para verificar si la tienda está abierta en horario de Panamá
function isStoreOpen() {
    const now = new Date();
    const panamaTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Panama" }));
    const day = panamaTime.getDay(); // 0: Domingo, 1: Lunes, ..., 6: Sábado
    const hour = panamaTime.getHours();

    if (day >= 1 && day <= 5) {
        // Lunes a Viernes
        return hour >= 9 && hour < 20;
    } else if (day === 0 || day === 6) {
        // Sábado y Domingo
        return hour >= 10 && hour < 18;
    }
    return false;
}

// Función para agendar un recordatorio en minutos u horas
function scheduleReminder(timeAmount, timeUnit, message, contact) {
    let timeInMs;
    if (timeUnit === 'minutos') {
        timeInMs = timeAmount * 60 * 1000;
    } else if (timeUnit === 'horas') {
        timeInMs = timeAmount * 60 * 60 * 1000;
    }

    setTimeout(() => {
        contact.reply(`Recordatorio: ${message}`);
    }, timeInMs);
}

// Función para agendar un recordatorio en una fecha y hora específica
function scheduleReminderAt(dateTime, message, contact) {
    const now = new Date();
    const timeUntilReminder = dateTime - now;

    if (timeUntilReminder > 0) {
        setTimeout(() => {
            contact.reply(`Recordatorio: ${message}`);
        }, timeUntilReminder);
    } else {
        contact.reply("La fecha y hora especificadas ya han pasado. No puedo programar un recordatorio para un momento en el pasado.");
    }
}

// Función para reformular la solicitud de recordatorio con IA
async function correctReminderRequest(messageBody, contactId) {
    const correctionPrompt = `
    Un cliente ha intentado programar un recordatorio con el siguiente mensaje: "${messageBody}".
    Ayúdalo a reformular su solicitud para que sea más clara y precisa. Aquí tienes algunos ejemplos correctos:
    
    - "Recordatorio en 30 minutos para revisar las nuevas laptops."
    - "Recordatorio mañana a las 9:00 AM para revisar las ofertas."
    
    Reformula la solicitud del cliente para que cumpla con estos formatos.`;

    const correctedResponse = await generateResponse(correctionPrompt, contactId);
    return correctedResponse;
}

// Configurar el cliente de WhatsApp Web
const whatsappClient = new Client();

whatsappClient.on('qr', (qr) => {
    // Generar el código QR en base64 y enviarlo al frontend a través de Socket.IO
    qrcode.toDataURL(qr, (err, qrCodeUrl) => {
        if (err) {
            console.error('Error generando el QR:', err);
        } else {
            io.emit('qr', qrCodeUrl); // Emitir el QR al frontend
        }
    });
});

whatsappClient.on('ready', () => {
    console.log('El cliente de WhatsApp Web está listo!');
    io.emit('ready', 'El cliente de WhatsApp Web está listo!');
});

whatsappClient.on('message', async message => {
    const contactId = message.from;

    // Verificar si el usuario está pausado (pidió hablar con una persona real)
    if (pausedUsers[contactId]) {
        console.log(`Usuario ${contactId} está pausado, mensajes ignorados.`);
        return; // Ignorar todos los mensajes mientras el bot está pausado
    }

    console.log(`Mensaje recibido: ${message.body}`);

    // Ignorar imágenes, stickers, videos, documentos y mensajes de ubicación
    if (message.hasMedia) {
        if (message.type === 'audio') {
            console.log('Se te va a comunicar con un asistente real.');
            message.reply('Se te va a comunicar con un asistente real.');
            return; // Salir de la función y no procesar más
        } else if (
            message.type === 'sticker' || 
            message.type === 'image' || 
            message.type === 'video' || 
            message.type === 'document' || 
            message.type === 'location'
        ) {
            console.log('Mensaje ignorado por ser multimedia.');
            return; // Salir de la función y no procesar más
        }
    }

    // Simple filtro de spam basado en contenido repetitivo
    const spamWords = ['spam', 'publicidad', 'promo']; // Palabras claves para identificar spam
    const isSpam = spamWords.some(word => message.body.toLowerCase().includes(word));

    if (isSpam) {
        console.log('Mensaje ignorado por ser considerado spam.');
        return; // Salir de la función y no procesar
    }

    let responseText;

    if (message.body.toLowerCase().includes('contactar persona real')) {
        // Pausar la interacción del bot y simular que se está contactando a una persona real
        message.reply('Conectándote con un asistente humano. Por favor, espera.');

        // Marcar al usuario como pausado
        pausedUsers[contactId] = true;

        // Reiniciar el bot después de 30 minutos de inactividad
        setTimeout(() => {
            console.log(`Reiniciando el bot para el usuario ${contactId} después de 30 minutos de inactividad.`);
            delete pausedUsers[contactId]; // Quitar la pausa del usuario
            whatsappClient.sendMessage(contactId, 'El asistente virtual está disponible de nuevo. ¿En qué más puedo ayudarte?');
        }, 30 * 60 * 1000); // 30 minutos en milisegundos

        return; // Detener el procesamiento de mensajes
    }

    if (message.body.toLowerCase() === 'hola') {
        responseText = '¡Hola! ¿En qué puedo ayudarte con respecto a ElectronicsJS?';
    } else if (message.body.toLowerCase().startsWith('recordatorio')) {
        // Parsear el mensaje para detectar el formato correcto
        const matchTime = message.body.match(/en (\d+)\s?(minutos|horas)/i);
        const matchDateTime = message.body.match(/el (\d{1,2}) de (\w+) a las (\d{1,2}):(\d{2})\s?(AM|PM)?/i);

        if (matchTime) {
            const timeAmount = parseInt(matchTime[1], 10);
            const timeUnit = matchTime[2].toLowerCase();
            scheduleReminder(timeAmount, timeUnit, 'Es hora de pasar por ElectronicsJS para revisar las nuevas laptops.', message);
            responseText = `Te enviaré un recordatorio en ${timeAmount} ${timeUnit}.`;
        } else if (matchDateTime) {
            const day = parseInt(matchDateTime[1], 10);
            const monthName = matchDateTime[2].toLowerCase();
            const hour = parseInt(matchDateTime[3], 10);
            const minute = parseInt(matchDateTime[4], 10);
            const period = matchDateTime[5] || 'AM';

            const months = {
                "enero": 0,
                "febrero": 1,
                "marzo": 2,
                "abril": 3,
                "mayo": 4,
                "junio": 5,
                "julio": 6,
                "agosto": 7,
                "septiembre": 8,
                "octubre": 9,
                "noviembre": 10,
                "diciembre": 11
            };

            const month = months[monthName];
            let hour24 = hour;
            if (period.toUpperCase() === 'PM' && hour < 12) {
                hour24 += 12;
            } else if (period.toUpperCase() === 'AM' && hour === 12) {
                hour24 = 0;
            }

            const now = new Date();
            const year = now.getFullYear();
            const reminderDate = new Date(year, month, day, hour24, minute);

            scheduleReminderAt(reminderDate, 'Es hora de pasar por ElectronicsJS para revisar las nuevas laptops.', message);
            responseText = `Te enviaré un recordatorio el ${day} de ${monthName} a las ${hour}:${minute} ${period}.`;
        } else {
            // Usar IA para ayudar a reformular la solicitud de recordatorio
            responseText = await correctReminderRequest(message.body, contactId);
            responseText += "\nPor favor, intenta de nuevo con este formato sugerido.";
        }
    } else {
        // Verificar si la tienda está abierta en horario de Panamá
        if (isStoreOpen()) {
            // Generar una respuesta usando la IA
            responseText = await generateResponse(message.body, contactId);
        } else {
            responseText = 'Gracias por tu mensaje. Nuestra tienda está cerrada en este momento, pero responderemos tan pronto como volvamos a abrir.';
        }
    }

    message.reply(responseText);
});


whatsappClient.initialize();

// Configurar Express y Socket.IO
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Servir archivos estáticos desde la carpeta 'web'
app.use(express.static(path.join(__dirname, 'web')));

// Servir el archivo index.html en la ruta raíz
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'web', 'index.html'));
});

server.listen(3000, () => {
    console.log('Servidor escuchando en http://localhost:3000');
});
