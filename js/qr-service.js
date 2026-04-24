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
        image: "assets/logo.png",
        dotsOptions: {
            color: "#8DBE23", // Verde Lima
            type: "rounded"
        },
        backgroundOptions: {
            color: "transparent",
        },
        imageOptions: {
            crossOrigin: "anonymous",
            margin: 5
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
    const printWindow = window.open('', '_blank', 'width=800,height=800');
    
    // Obtenemos los datos del contenedor desde el DOM (del elemento html) si es posible,
    // o al menos mostramos el nombre
    printWindow.document.write(`
        <html>
            <head>
                <title>Imprimir QR - ${name}</title>
                <style>
                    @page { size: auto; margin: 0mm; }
                    body { font-family: 'Arial', sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; text-align: center; }
                    .tag-container { border: 2px dashed #ccc; padding: 40px; border-radius: 10px; max-width: 500px; display: flex; flex-direction: column; align-items: center; }
                    .qr-box { width: 300px; height: 300px; margin-bottom: 20px; }
                    .qr-box svg { width: 100%; height: 100%; }
                    .title { font-size: 32px; font-weight: bold; margin: 10px 0; text-transform: uppercase; }
                    .subtitle { font-size: 18px; color: #555; }
                    .logo-text { font-size: 16px; font-weight: bold; color: #8DBE23; margin-top: 30px; letter-spacing: 2px; }
                </style>
                <script src="https://cdn.jsdelivr.net/npm/qr-code-styling@1.5.0/lib/qr-code-styling.js"><\/script>
            </head>
            <body>
                <div class="tag-container">
                    <div id="qr-canvas" class="qr-box"></div>
                    <div class="title">${name}</div>
                    <div class="subtitle">Ubicación / Contenedor</div>
                    <div class="subtitle" style="font-size: 14px; margin-top: 5px;">ID: ${containerId}</div>
                    <div class="logo-text">ARQUEOSCAN</div>
                </div>
                <script>
                    const qrCode = new QRCodeStyling({
                        width: 300,
                        height: 300,
                        type: "svg",
                        data: "${containerId}",
                        dotsOptions: { color: "#000000", type: "rounded" },
                        backgroundOptions: { color: "#ffffff" },
                        cornersSquareOptions: { type: "extra-rounded", color: "#000000" },
                        cornersDotOptions: { type: "dot", color: "#000000" },
                        qrOptions: { errorCorrectionLevel: 'M' }
                    });
                    qrCode.append(document.getElementById("qr-canvas"));
                    setTimeout(() => { window.print(); window.close(); }, 1000);
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
        cornersDotOptions: { type: "dot", color: "#8DBE23" },
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
    const printWindow = window.open('', '_blank', 'width=800,height=800');
    
    printWindow.document.write(`
        <html>
            <head>
                <title>Imprimir QR - ${p.name || p.objeto}</title>
                <style>
                    @page { size: auto; margin: 0mm; }
                    body { font-family: 'Arial', sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; text-align: center; }
                    .tag-container { border: 2px dashed #ccc; padding: 30px; border-radius: 10px; max-width: 400px; display: flex; flex-direction: column; align-items: center; }
                    .qr-box { width: 250px; height: 250px; margin-bottom: 20px; }
                    .qr-box svg { width: 100%; height: 100%; }
                    .inv { font-weight: bold; font-size: 28px; margin-bottom: 10px; }
                    .title { font-size: 20px; font-weight: bold; margin-bottom: 5px; }
                    .subtitle { font-size: 16px; color: #555; margin-bottom: 5px; }
                    .logo-text { font-size: 14px; font-weight: bold; color: #8DBE23; margin-top: 20px; letter-spacing: 2px; }
                </style>
                <script src="https://cdn.jsdelivr.net/npm/qr-code-styling@1.5.0/lib/qr-code-styling.js"><\/script>
            </head>
            <body>
                <div class="tag-container">
                    <div id="qr-canvas" class="qr-box"></div>
                    <div class="inv">${p.inventory_number_new || p.id}</div>
                    <div class="title">${p.objeto || p.name || 'Sin nombre'}</div>
                    <div class="subtitle">${p.material || ''}</div>
                    <div class="logo-text">ARQUEOSCAN</div>
                </div>
                <script>
                    const qrCode = new QRCodeStyling({
                        width: 250,
                        height: 250,
                        type: "svg",
                        data: "${p.id}",
                        dotsOptions: { color: "#8DBE23", type: "rounded" },
                        backgroundOptions: { color: "#ffffff" },
                        cornersSquareOptions: { type: "extra-rounded", color: "#8DBE23" },
                        cornersDotOptions: { type: "dot", color: "#8DBE23" },
                        qrOptions: { errorCorrectionLevel: 'M' }
                    });
                    qrCode.append(document.getElementById("qr-canvas"));
                    setTimeout(() => { window.print(); window.close(); }, 1000);
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
