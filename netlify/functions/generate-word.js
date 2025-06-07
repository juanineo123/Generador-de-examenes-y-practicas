// netlify/functions/generate-word.js

const docx = require("docx");
const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, BorderStyle, WidthType, AlignmentType, PageBreak } = docx; // Agregado PageBreak

// Helper para parsear HTML simple a la estructura de docx
// NOTA: Esto es una implementación MUY BÁSICA y no manejará CSS complejo,
// imágenes, o estructuras HTML anidadas arbitrarias.
// Para HTML más complejo, necesitarías una librería de parseo HTML más robusta.
function parseHtmlToDocxElements(htmlString) {
    const elements = [];
    
    // Eliminar etiquetas de estilo si están dentro del body (normalmente irían en head)
    htmlString = htmlString.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');

    // Primer paso: procesar el contenido de la evaluación-container para extraer los componentes principales
    // Se asume que el `generatedHtmlForDocx` del frontend ya envuelve el contenido en `<div class="evaluation-container-for-docx">`
    const containerMatch = htmlString.match(/<div class="evaluation-container-for-docx">([\s\S]*?)<\/div>/i);
    const contentToParse = containerMatch ? containerMatch[1] : htmlString; // Si no hay container, usa todo el HTML

    // Expresiones regulares para capturar los bloques principales
    const headerRegex = /<div class="grid grid-cols-2[^>]*>([\s\S]*?)<\/div>/i;
    const questionsRegex = /<h2>Preguntas<\/h2>([\s\S]*?)(?=<div class="answer-key"|$)/i; // Busca preguntas hasta el solucionario o el final
    const answersRegex = /<div class="answer-key">([\s\S]*?)<\/div>/i;
    
    // --- Procesar el encabezado (datos del examen) ---
    // Buscar el H1 del título de la evaluación
    const h1Match = contentToParse.match(/<h1>(.*?)<\/h1>/i);
    if (h1Match) {
        elements.push(new Paragraph({ 
            children: [new TextRun({ text: h1Match[1].toUpperCase(), bold: true })], 
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 } // Espacio después del título principal
        }));
    }

    const headerContentMatch = contentToParse.match(headerRegex);
    if (headerContentMatch) {
        // Asume que los datos están en párrafos <p> dentro del div
        const headerParagraphs = headerContentMatch[1].match(/<p\b[^>]*>([\s\S]*?)<\/p>/gi);
        if (headerParagraphs) {
            headerParagraphs.forEach(pTag => {
                const textContent = pTag.replace(/<p\b[^>]*>|<\/p>/gi, '').replace(/<b>|<\/b>/gi, '').trim();
                if (textContent) {
                    elements.push(new Paragraph({ 
                        children: [new TextRun(textContent)], 
                        alignment: AlignmentType.LEFT,
                        spacing: { after: 80 } // Pequeño espacio entre cada dato del encabezado
                    }));
                }
            });
        }
    }
    // Añadir línea para el alumno
    elements.push(new Paragraph({ 
        children: [new TextRun({ text: 'Alumno(a): ____________________________________________________________________________', bold: true })], 
        spacing: { before: 200, after: 300 } // Espacio antes y después de la línea del alumno
    }));


    // --- Procesar las preguntas ---
    const questionsContentMatch = contentToParse.match(questionsRegex);
    if (questionsContentMatch) {
        elements.push(new Paragraph({ children: [new TextRun('PREGUNTAS')], heading: HeadingLevel.HEADING_2, alignment: AlignmentType.CENTER, spacing: { before: 400, after: 200 } }));
        const questionsHtml = questionsContentMatch[1];
        const questionBlockRegex = /<div class="question-block">([\s\S]*?)<\/div>/gi;
        let qMatch;
        let qIndex = 0;
        while ((qMatch = questionBlockRegex.exec(questionsHtml)) !== null) {
            qIndex++;
            const blockContent = qMatch[1];
            
            // Título de la pregunta (h3)
            const h3Match = blockContent.match(/<h3>([\s\S]*?)<\/h3>/i);
            if (h3Match) {
                elements.push(new Paragraph({
                    children: [new TextRun({ text: `${qIndex}. ${h3Match[1].replace(/<\/?b>/g, '')}`, bold: true })], // Quitar negritas si ya las tienen
                    spacing: { before: 200, after: 100 }
                }));
            }

            // Opciones de respuesta (ul/li)
            const ulMatch = blockContent.match(/<ul[^>]*>([\s\S]*?)<\/ul>/i);
            if (ulMatch) {
                const liRegex = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
                let liMatch;
                let alphaCounter = 0;
                while ((liMatch = liRegex.exec(ulMatch[1])) !== null) {
                    const alphaChar = String.fromCharCode(97 + alphaCounter); // 'a', 'b', 'c', ...
                    elements.push(new Paragraph({
                        children: [new TextRun(`${alphaChar}) ${liMatch[1].trim()}`)],
                        indent: { left: docx.convertInchesToTwip(0.5) }, // Sangría para opciones
                        spacing: { after: 50 }
                    }));
                    alphaCounter++;
                }
            } else {
                // Para preguntas de desarrollo o V/F, añadir un espacio o línea
                const pText = blockContent.match(/<p class="text-xs[^>]*>([\s\S]*?)<\/p>/i);
                if (pText) {
                    elements.push(new Paragraph({ children: [new TextRun(pText[1].trim())], spacing: { after: 50 } }));
                }
                // Añadir líneas para respuesta
                for (let i = 0; i < 4; i++) { // Cuatro líneas para desarrollo
                    elements.push(new Paragraph({ children: [new TextRun('____________________________________________________________________________________')], spacing: { after: 50 } }));
                }
                elements.push(new Paragraph({ spacing: { after: 200 } })); // Espacio entre preguntas
            }
        }
    }

    // --- Procesar el solucionario ---
    const answersContentMatch = contentToParse.match(answersRegex);
    if (answersContentMatch) {
        elements.push(new Paragraph({ children: [new TextRun('SOLUCIONARIO')], heading: HeadingLevel.HEADING_2, alignment: AlignmentType.CENTER, pageBreakBefore: PageBreak.BEFORE_CURRENT_PAGE, spacing: { before: 400, after: 200 } }));
        const answersHtml = answersContentMatch[1];
        const answerParaRegex = /<p><b>(\d+):<\/b>([\s\S]*?)<\/p>/gi; // Captura número y respuesta
        let aMatch;
        while ((aMatch = answerParaRegex.exec(answersHtml)) !== null) {
            elements.push(new Paragraph({
                children: [
                    new TextRun({ text: `${aMatch[1]}. `, bold: true }),
                    new TextRun(aMatch[2].trim())
                ],
                spacing: { after: 100 }
            }));
        }
    }

    return elements;
}


exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { htmlContent } = JSON.parse(event.body);

        // Intenta extraer el título de la evaluación para el nombre del archivo
        const evaluationTitleMatch = htmlContent.match(/<h1>(.*?)<\/h1>/i);
        const fileNameBase = evaluationTitleMatch ? evaluationTitleMatch[1].replace(/ /g, '_') : 'evaluacion_generada';
        const fileName = `${fileNameBase}.docx`;
        
        console.log('Iniciando generación de DOCX con la librería docx...');

        // Convierte el HTML generado por tu frontend a elementos de docx
        const docxElements = parseHtmlToDocxElements(htmlContent);

        // Crea el documento DOCX
        const doc = new Document({
            sections: [{
                properties: {
                    // Configura márgenes y tamaño de página (A4)
                    page: {
                        size: {
                            width: docx.convertMillimetersToTwip(210), // A4 ancho
                            height: docx.convertMillimetersToTwip(297), // A4 alto
                        },
                        margin: {
                            top: docx.convertMillimetersToTwip(25.4), // 1 pulgada
                            bottom: docx.convertMillimetersToTwip(25.4), // 1 pulgada
                            left: docx.convertMillimetersToTwip(25.4), // 1 pulgada
                            right: docx.convertMillimetersToTwip(25.4), // 1 pulgada
                        }
                    }
                },
                children: docxElements,
            }],
        });

        // Genera el buffer del documento DOCX
        const buffer = await Packer.toBuffer(doc);

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "Content-Disposition": `attachment; filename="${fileName}"`, // Envía el nombre del archivo aquí
            },
            body: buffer.toString('base64'),
            isBase64Encoded: true,
        };

    } catch (error) {
        console.error('Error en la función generate-word:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message, stack: error.stack }),
        };
    }
};