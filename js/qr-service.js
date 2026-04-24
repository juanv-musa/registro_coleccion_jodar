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

    // Configuración optimizada para móviles
    const config = { 
        fps: 15, // Un poco más rápido para mejor respuesta
        qrbox: (viewWidth, viewHeight) => {
            // Cuadro de escaneo dinámico: 70% del ancho o 250px
            const minDim = Math.min(viewWidth, viewHeight);
            const boxSize = Math.floor(minDim * 0.7);
            return { width: boxSize, height: boxSize };
        },
        aspectRatio: 1.0,
        rememberLastUsedCamera: true,
        supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA]
    };

    html5QrScanner = new Html5QrcodeScanner(elementId, config, false);

    html5QrScanner.render((decodedText, decodedResult) => {
        // Detener el escáner inmediatamente tras éxito para ahorrar batería y evitar scans múltiples
        html5QrScanner.clear().then(() => {
            onScanSuccess(decodedText, decodedResult);
        }).catch(err => {
            console.warn("Error clearing scanner:", err);
            onScanSuccess(decodedText, decodedResult);
        });
    }, (error) => {
        // Los errores de "no detectado" son normales y frecuentes durante el escaneo
    });

    // Pequeño hack para forzar la cámara trasera en muchos dispositivos
    setTimeout(() => {
        const select = document.querySelector(`#${elementId} select`);
        if (select && select.options.length > 1) {
            for (let i = 0; i < select.options.length; i++) {
                if (select.options[i].text.toLowerCase().includes('back') || 
                    select.options[i].text.toLowerCase().includes('trasera') ||
                    select.options[i].text.toLowerCase().includes('environment')) {
                    select.selectedIndex = i;
                    break;
                }
            }
        }
    }, 2000);
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
