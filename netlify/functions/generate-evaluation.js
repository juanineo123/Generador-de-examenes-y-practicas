// Importa el cliente de Google Generative AI
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");

// Accede a tu API Key desde las variables de entorno de Netlify
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

exports.handler = async (event) => {
    // Solo permitir peticiones POST
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const data = JSON.parse(event.body);

        // --- PROMPT FINAL Y MÁS DIRECTO ---
        // Se le pide explícitamente que la única salida sea un string JSON válido.
        const prompt = `
            Eres un asistente de IA para docentes peruanos. Tu única función es generar un objeto JSON válido que contenga una evaluación educativa completa.

            **Parámetros de la Evaluación:**
            -   **Título:** "${data.evaluationTitle}"
            -   **Área:** "${data.course}"
            -   **Nivel:** "${data.level}"
            -   **Grado:** "${data.grade}"
            -   **Temas:** "${data.topics}"
            -   **Número de Preguntas:** ${data.questionCount}
            -   **Tipos de Preguntas:** "${data.questionType}"

            **Instrucciones Estrictas:**
            1.  Tu respuesta DEBE SER EXCLUSIVAMENTE un string de texto que pueda ser parseado como JSON. No incluyas la palabra "json" ni los marcadores de código \`\`\`.
            2.  El objeto JSON debe tener una clave "title" (string) y una clave "questions" (un array de objetos).
            3.  El array "questions" DEBE contener exactamente ${data.questionCount} objetos. Esta es la regla más importante.
            4.  Cada objeto de pregunta debe tener las claves "type", "question", y "answer".
            5.  Solo las preguntas de "Opción Múltiple" deben tener la clave "options" (un array de 4 strings).

            **Ejemplo de la estructura de salida requerida:**
            {
              "title": "Práctica Calificada",
              "questions": [
                {
                  "type": "Opción Múltiple",
                  "question": "¿Cuál es la capital de Perú?",
                  "options": ["Bogotá", "Santiago", "Lima", "Quito"],
                  "answer": "Lima"
                }
              ]
            }

            Genera la evaluación ahora.
        `;

        // --- CONFIGURACIÓN DEL MODELO ---
        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            // Se eliminó el modo JSON forzado que causaba el error.
            // Confiamos en el prompt para obtener el formato correcto.
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 8192, // Suficiente espacio para muchas preguntas
            },
            safetySettings: [ // Ajustes para evitar bloqueos innecesarios
                { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            ],
        });

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // Limpieza y validación del JSON recibido de la IA
        let jsonResponse;
        try {
            // Intenta parsear el texto directamente.
            jsonResponse = JSON.parse(text);
        } catch (e) {
            // Si falla, intenta limpiar el texto de posibles marcadores de markdown.
            console.log("Intento de limpieza de JSON fallido, reintentando...");
            const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
            jsonResponse = JSON.parse(cleanedText);
        }

        // Devolver la respuesta JSON parseada y válida al frontend
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(jsonResponse),
        };

    } catch (error) {
        console.error("Error Crítico en generate-evaluation:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "La IA no pudo generar una respuesta válida. Por favor, revisa la consola de Netlify para más detalles del error." }),
        };
    }
};
