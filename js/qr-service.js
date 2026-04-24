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

    html5QrScanner = new Html5QrcodeScanner(
        elementId, 
        { 
            fps: 10, 
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
            rememberLastUsedCamera: true
        }
    );

    html5QrScanner.render((decodedText, decodedResult) => {
        html5QrScanner.clear();
        onScanSuccess(decodedText, decodedResult);
    }, (error) => {
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
        width: 400, // Aumentar tamaño base
        height: 400,
        type: "svg",
        data: containerId,
        image: "assets/logo.png",
        dotsOptions: { 
            color: "#332211", // Café muy oscuro para máximo contraste (mejor que el dorado claro)
            type: "square" // Cuadrados son más fáciles de leer por sensores antiguos
        },
        backgroundOptions: { color: "#ffffff" },
        imageOptions: { 
            crossOrigin: "anonymous", 
            margin: 10, // Más margen para que el logo no tape datos críticos
            imageSize: 0.3 // Logo un poco más pequeño
        },
        cornersSquareOptions: { type: "square", color: "#332211" },
        cornersDotOptions: { type: "square", color: "#332211" },
        qrOptions: {
            errorCorrectionLevel: 'H' // Nivel de corrección alto para compensar el logo
        }
    });

    qrCode.download({ name: `QR-${name}-${containerId}`, extension: "png" });
}

// Global exposure
window.startScanner = startScanner;
window.stopScanner = stopScanner;
window.generatePieceQR = generatePieceQR;
window.downloadQR = downloadQR;
window.downloadContainerQR = downloadContainerQR;
