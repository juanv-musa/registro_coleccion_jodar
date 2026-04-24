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
    const qrCode = new QRCodeStyling({
        width: 600, // Aumentar resolución del archivo generado
        height: 600,
        type: "svg",
        data: containerId,
        image: "assets/logo.png",
        dotsOptions: { 
            color: "#000000", // Negro puro para máximo contraste absoluto
            type: "square" 
        },
        backgroundOptions: { color: "#ffffff" },
        imageOptions: { 
            crossOrigin: "anonymous", 
            margin: 15, // Más margen de seguridad
            imageSize: 0.15 // Logo mucho más pequeño (15% vs 30%) para no tapar datos
        },
        cornersSquareOptions: { type: "square", color: "#000000" },
        cornersDotOptions: { type: "square", color: "#000000" },
        qrOptions: {
            errorCorrectionLevel: 'H' // Máxima redundancia
        }
    });

    qrCode.download({ name: `QR-${name}-${containerId}`, extension: "png" });
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
        image: "assets/logo.png",
        dotsOptions: {
            color: "#000000", // Negro para piezas también, por seguridad
            type: "square"
        },
        backgroundOptions: { color: "#ffffff" },
        imageOptions: {
            crossOrigin: "anonymous",
            margin: 10,
            imageSize: 0.15
        },
        cornersSquareOptions: { type: "square", color: "#000000" },
        cornersDotOptions: { type: "square", color: "#000000" },
        qrOptions: { errorCorrectionLevel: 'H' }
    });

    qrCode.append(container);
    return qrCode;
}

// Global exposure
window.startScanner = startScanner;
window.stopScanner = stopScanner;
window.generatePieceQR = generatePieceQR;
window.downloadQR = downloadQR;
window.downloadContainerQR = downloadContainerQR;
