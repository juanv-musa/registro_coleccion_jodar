/**
 * Servicio de Códigos QR (Generación y Escaneo)
 * Utiliza: html5-qrcode para escaneo, qr-code-styling para generación
 */

let html5QrScanner = null;

/**
 * Escanea un código QR usando la cámara del dispositivo
 * @param {string} elementId - ID del div donde se renderizará el escáner
 * @param {function} onScanSuccess - Callback cuando se detecta un QR
 */
function startScanner(elementId, onScanSuccess) {
    if (html5QrScanner) {
        html5QrScanner.clear();
    }

    const config = { 
        fps: 20, // Mayor velocidad para escaneo instantáneo
        qrbox: (viewWidth, viewHeight) => {
            // Cuadro de escaneo más grande para móviles
            const minDim = Math.min(viewWidth, viewHeight);
            return { width: Math.floor(minDim * 0.8), height: Math.floor(minDim * 0.8) };
        },
        aspectRatio: 1.0,
        rememberLastUsedCamera: true,
        supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
        videoConstraints: {
            facingMode: { exact: "environment" } // Obliga a usar la cámara trasera
        },
        experimentalFeatures: {
            useBarCodeDetectorIfSupported: true
        }
    };

    html5QrScanner = new Html5QrcodeScanner(elementId, config, false);

    html5QrScanner.render((decodedText, decodedResult) => {
        html5QrScanner.clear().then(() => {
            onScanSuccess(decodedText, decodedResult);
        }).catch(() => {
            onScanSuccess(decodedText, decodedResult);
        });
    }, (error) => {
        // Ignorar errores de escaneo fallido durante la búsqueda
    });
}

function stopScanner() {
    if (html5QrScanner) {
        html5QrScanner.clear();
    }
}

function generatePieceQR(elementId, pieceId) {
    const container = document.getElementById(elementId);
    if (!container) return;
    
    container.innerHTML = ''; 

    const qrCode = new QRCodeStyling({
        width: 200,
        height: 200,
        type: "svg",
        data: pieceId,
        dotsOptions: {
            color: "#8DBE23",
            type: "rounded"
        },
        backgroundOptions: {
            color: "transparent",
        },
        cornersSquareOptions: {
            type: "extra-rounded",
            color: "#8DBE23"
        },
        cornersDotOptions: {
            type: "dot",
            color: "#8DBE23"
        }
    });

    qrCode.append(container);
    return qrCode;
}

function downloadQR(qrInstance, filename = "qr-pieza") {
    qrInstance.download({ name: filename, extension: "png" });
}

function downloadContainerQR(containerId, name = "Caja") {
    const printWindow = window.open('', '_blank', 'width=400,height=300');
    
    printWindow.document.write(`
        <html>
            <head>
                <title>Imprimir QR - ${name}</title>
                <style>
                    @page { size: auto; margin: 0mm; }
                    body { font-family: 'Arial', sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 0; background: #fff; }
                    .label { 
                        width: 60mm; height: 35mm; 
                        padding: 3mm; box-sizing: border-box; 
                        display: flex; flex-direction: column; align-items: center; justify-content: center;
                        border: 1px dashed #ccc; /* Para guía de corte si hace falta */
                    }
                    .qr-box { width: 22mm; height: 22mm; margin-bottom: 2mm; overflow: hidden; display: flex; align-items: center; justify-content: center; }
                    .qr-box canvas { width: 100% !important; height: 100% !important; object-fit: contain; }
                    .title { font-size: 10pt; font-weight: bold; text-align: center; line-height: 1.1; max-height: 22pt; overflow: hidden;}
                </style>
                <script src="https://cdn.jsdelivr.net/npm/qr-code-styling@1.5.0/lib/qr-code-styling.js"><\/script>
            </head>
            <body>
                <div class="label">
                    <div id="qr-canvas" class="qr-box"></div>
                    <div class="title">${name}</div>
                </div>
                <script>
                    const qrCode = new QRCodeStyling({
                        width: 400, height: 400, type: "canvas", data: "${containerId}",
                        dotsOptions: { color: "#000000", type: "rounded" },
                        cornersSquareOptions: { type: "extra-rounded", color: "#000000" },
                        cornersDotOptions: { type: "dot", color: "#000000" },
                        qrOptions: { errorCorrectionLevel: 'M' }
                    });
                    qrCode.append(document.getElementById("qr-canvas"));
                    setTimeout(() => { window.print(); window.close(); }, 500);
                <\/script>
            </body>
        </html>
    `);
    printWindow.document.close();
}

function generatePieceQR(elementId, pieceId) {
    const container = document.getElementById(elementId);
    if (!container) return;
    
    container.innerHTML = ''; 

    const qrCode = new QRCodeStyling({
        width: 250,
        height: 250,
        type: "svg",
        data: pieceId,
        dotsOptions: {
            color: "#8DBE23", 
            type: "rounded"
        },
        backgroundOptions: { color: "#ffffff" },
        cornersSquareOptions: { type: "extra-rounded", color: "#8DBE23" },
        cornersDotOptions: { type: "dot", color: "#6F961B" },
        qrOptions: { errorCorrectionLevel: 'M' }
    });

    qrCode.append(container);
    return qrCode;
}

function generateContainerQRPreview(elementId, containerId) {
    const container = document.getElementById(elementId);
    if (!container) return;
    
    container.innerHTML = ''; 

    const qrCode = new QRCodeStyling({
        width: 80,
        height: 80,
        type: "svg",
        data: containerId,
        dotsOptions: {
            color: "#000000",
            type: "rounded"
        },
        backgroundOptions: { color: "transparent" },
        cornersSquareOptions: { type: "extra-rounded", color: "#000000" },
        cornersDotOptions: { type: "dot", color: "#000000" },
        qrOptions: { errorCorrectionLevel: 'M' }
    });

    qrCode.append(container);
    return qrCode;
}

window.printPieceQR = function() {
    if (typeof state === 'undefined' || !state.currentPiece) return;
    const p = state.currentPiece;
    const printWindow = window.open('', '_blank', 'width=400,height=300');
    
    printWindow.document.write(`
        <html>
            <head>
                <title>Imprimir QR - ${p.name || p.objeto}</title>
                <style>
                    @page { size: auto; margin: 0mm; }
                    body { font-family: 'Arial', sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 0; background: #fff;}
                    .label { 
                        width: 45mm; height: 20mm; 
                        padding: 2mm; box-sizing: border-box; 
                        display: flex; align-items: center; gap: 3mm;
                        overflow: hidden;
                        border: 1px dashed #ccc; /* Guía de corte */
                    }
                    .qr-box { width: 10mm; height: 10mm; flex-shrink: 0; overflow: hidden; display: flex; align-items: center; justify-content: center; }
                    .qr-box canvas { width: 100% !important; height: 100% !important; object-fit: contain; }
                    .info { display: flex; flex-direction: column; justify-content: center; overflow: hidden; }
                    .inv { font-size: 8pt; font-weight: bold; margin-bottom: 1mm; white-space: nowrap; text-overflow: ellipsis; overflow: hidden;}
                    .title { font-size: 6pt; line-height: 1.2; max-height: 14pt; overflow: hidden; }
                </style>
                <script src="https://cdn.jsdelivr.net/npm/qr-code-styling@1.5.0/lib/qr-code-styling.js"><\/script>
            </head>
            <body>
                <div class="label">
                    <div id="qr-canvas" class="qr-box"></div>
                    <div class="info">
                        <div class="inv">${p.inventory_number_new || p.id}</div>
                        <div class="title">${p.objeto || p.name || 'Sin nombre'}</div>
                    </div>
                </div>
                <script>
                    const qrCode = new QRCodeStyling({
                        width: 400, height: 400, type: "canvas", data: "${p.id}",
                        dotsOptions: { color: "#000000", type: "rounded" },
                        cornersSquareOptions: { type: "extra-rounded", color: "#000000" },
                        cornersDotOptions: { type: "dot", color: "#000000" },
                        qrOptions: { errorCorrectionLevel: 'M' }
                    });
                    qrCode.append(document.getElementById("qr-canvas"));
                    setTimeout(() => { window.print(); window.close(); }, 500);
                <\/script>
            </body>
        </html>
    `);
    printWindow.document.close();
};

const bulkPrintStyles = `
    @page { size: A4; margin: 10mm; }
    body { font-family: 'Arial', sans-serif; margin: 0; padding: 0; display: flex; flex-wrap: wrap; align-content: flex-start; gap: 5mm; background: #fff;}
`;

window.printFilteredPieces = function() {
    const pieces = state.filteredPieces || state.allPieces;
    if (!pieces || pieces.length === 0) return;
    
    const printWindow = window.open('', '_blank');
    let html = `
        <html>
            <head>
                <title>Imprimir Etiquetas Piezas</title>
                <style>
                    ${bulkPrintStyles}
                    .label { 
                        width: 45mm; height: 20mm; 
                        border: 1px dashed #ccc; 
                        padding: 2mm; box-sizing: border-box; 
                        display: flex; align-items: center; gap: 3mm;
                        overflow: hidden;
                    }
                    .qr-box { width: 10mm; height: 10mm; flex-shrink: 0; overflow: hidden; display: flex; align-items: center; justify-content: center; }
                    .qr-box canvas { width: 100% !important; height: 100% !important; object-fit: contain; }
                    .info { display: flex; flex-direction: column; justify-content: center; overflow: hidden; }
                    .inv { font-size: 8pt; font-weight: bold; margin-bottom: 1mm; white-space: nowrap; text-overflow: ellipsis; overflow: hidden;}
                    .title { font-size: 6pt; line-height: 1.2; max-height: 14pt; overflow: hidden; }
                </style>
                <script src="https://cdn.jsdelivr.net/npm/qr-code-styling@1.5.0/lib/qr-code-styling.js"><\/script>
            </head>
            <body>
    `;
    
    pieces.forEach(p => {
        html += `
            <div class="label">
                <div id="qr-${p.id}" class="qr-box"></div>
                <div class="info">
                    <div class="inv">${p.inventory_number_new || p.id}</div>
                    <div class="title">${p.objeto || p.name || 'Sin nombre'}</div>
                </div>
            </div>
        `;
    });

    html += `
            <script>
                const pieces = ${JSON.stringify(pieces.map(p => p.id))};
                pieces.forEach(id => {
                    const qr = new QRCodeStyling({
                        width: 400, height: 400, type: "canvas", data: id,
                        dotsOptions: { color: "#000000", type: "rounded" },
                        cornersSquareOptions: { type: "extra-rounded", color: "#000000" },
                        cornersDotOptions: { type: "dot", color: "#000000" },
                        qrOptions: { errorCorrectionLevel: 'M' }
                    });
                    qr.append(document.getElementById("qr-" + id));
                });
                setTimeout(() => { window.print(); }, 1500);
            <\/script>
            </body>
        </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
};

window.printFilteredLocations = function() {
    const locations = state.filteredLocations || state.allLocations;
    if (!locations || locations.length === 0) return;
    
    const printWindow = window.open('', '_blank');
    let html = `
        <html>
            <head>
                <title>Imprimir Etiquetas Ubicaciones</title>
                <style>
                    ${bulkPrintStyles}
                    .label { 
                        width: 60mm; height: 35mm; 
                        border: 1px dashed #ccc; 
                        padding: 3mm; box-sizing: border-box; 
                        display: flex; flex-direction: column; align-items: center; justify-content: center;
                    }
                    .qr-box { width: 22mm; height: 22mm; margin-bottom: 2mm; overflow: hidden; display: flex; align-items: center; justify-content: center; }
                    .qr-box canvas { width: 100% !important; height: 100% !important; object-fit: contain; }
                    .title { font-size: 10pt; font-weight: bold; text-align: center; line-height: 1.1; max-height: 22pt; overflow: hidden;}
                </style>
                <script src="https://cdn.jsdelivr.net/npm/qr-code-styling@1.5.0/lib/qr-code-styling.js"><\/script>
            </head>
            <body>
    `;
    
    locations.forEach(c => {
        html += `
            <div class="label">
                <div id="qr-${c.id}" class="qr-box"></div>
                <div class="title">${c.name || 'Caja'}</div>
            </div>
        `;
    });

    html += `
            <script>
                const locs = ${JSON.stringify(locations.map(c => c.id))};
                locs.forEach(id => {
                    const qr = new QRCodeStyling({
                        width: 400, height: 400, type: "canvas", data: id,
                        dotsOptions: { color: "#000000", type: "rounded" },
                        cornersSquareOptions: { type: "extra-rounded", color: "#000000" },
                        cornersDotOptions: { type: "dot", color: "#000000" },
                        qrOptions: { errorCorrectionLevel: 'M' }
                    });
                    qr.append(document.getElementById("qr-" + id));
                });
                setTimeout(() => { window.print(); }, 1500);
            <\/script>
            </body>
        </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
};

/**
 * Imprime una etiqueta QR para una sala/habitación.
 * El QR codifica "S-{salaId}" para distinguirlo de piezas y contenedores.
 * @param {string} salaId - ID único de la sala (slug del nombre)
 * @param {string} salaName - Nombre legible de la sala
 * @param {string} spaceType - 'almacen' | 'exposicion'
 */
window.printRoomQR = function(salaId, salaName, spaceType = 'almacen') {
    const printWindow = window.open('', '_blank', 'width=500,height=400');
    const typeLabel = spaceType === 'exposicion' ? 'EXPOSICIÓN' : 'ALMACÉN';
    const qrData = `S-${salaId}`;

    printWindow.document.write(`
        <html>
            <head>
                <title>QR Sala - ${salaName}</title>
                <style>
                    @page { size: auto; margin: 0mm; }
                    body {
                        font-family: 'Arial', sans-serif;
                        display: flex; align-items: center; justify-content: center;
                        height: 100vh; margin: 0; background: #fff;
                    }
                    .label {
                        width: 80mm; height: 55mm;
                        padding: 4mm; box-sizing: border-box;
                        display: flex; flex-direction: column; align-items: center; justify-content: center;
                        border: 2px solid #222;
                        border-radius: 3mm;
                    }
                    .type-badge {
                        font-size: 6pt; font-weight: bold; letter-spacing: 1px;
                        background: #222; color: #fff;
                        padding: 1mm 3mm; border-radius: 2mm;
                        margin-bottom: 2mm; text-transform: uppercase;
                    }
                    .qr-box { width: 30mm; height: 30mm; margin-bottom: 2mm; display: flex; align-items: center; justify-content: center; }
                    .qr-box canvas { width: 100% !important; height: 100% !important; object-fit: contain; }
                    .room-name { font-size: 12pt; font-weight: bold; text-align: center; line-height: 1.2; max-width: 70mm; }
                    .qr-id { font-size: 6pt; color: #888; margin-top: 1mm; font-family: monospace; }
                </style>
                <script src="https://cdn.jsdelivr.net/npm/qr-code-styling@1.5.0/lib/qr-code-styling.js"><\/script>
            </head>
            <body>
                <div class="label">
                    <div class="type-badge">${typeLabel}</div>
                    <div id="qr-canvas" class="qr-box"></div>
                    <div class="room-name">${salaName}</div>
                    <div class="qr-id">${qrData}</div>
                </div>
                <script>
                    const qrCode = new QRCodeStyling({
                        width: 400, height: 400, type: "canvas",
                        data: "${qrData}",
                        dotsOptions: { color: "#000000", type: "rounded" },
                        cornersSquareOptions: { type: "extra-rounded", color: "#000000" },
                        cornersDotOptions: { type: "dot", color: "#000000" },
                        qrOptions: { errorCorrectionLevel: 'H' }
                    });
                    qrCode.append(document.getElementById("qr-canvas"));
                    setTimeout(() => { window.print(); window.close(); }, 600);
                <\/script>
            </body>
        </html>
    `);
    printWindow.document.close();
};

// Global exposure
window.startScanner = startScanner;
window.stopScanner = stopScanner;
window.generatePieceQR = generatePieceQR;
window.generateContainerQRPreview = generateContainerQRPreview;
window.downloadQR = downloadQR;
window.downloadContainerQR = downloadContainerQR;
window.printPieceQR = printPieceQR;
window.printFilteredPieces = printFilteredPieces;
window.printFilteredLocations = printFilteredLocations;
window.printRoomQR = printRoomQR;
