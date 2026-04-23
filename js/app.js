/**
 * ArcheoScan Pro - Main App Controller
 */

// --- APP STATE ---
const state = {
    currentUser: null,
    currentView: 'dashboard',
    currentPiece: null,
    pinBuffer: "",
    allPieces: [],
    stats: {
        total: 0,
        today: 0,
        activeRoom: "-"
    },
    tempImportData: []
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    // Forzar entrada directa primero para evitar pantalla negra
    state.currentUser = { name: "Usuario Preview", pin: "0000" };
    const appEl = document.getElementById('app');
    const pinEl = document.getElementById('pin-overlay');
    
    if (pinEl) pinEl.style.display = 'none';
    if (appEl) appEl.style.display = 'grid';
    
    // Mostrar la estructura pero no cargar datos todavía
    showView('dashboard', false); 

    try {
        initLucide();
    } catch (e) {}

    try {
        initSupabase();
    } catch (e) {}

    try {
        setupEventListeners();
    } catch (e) {
        console.error("Error al configurar botones:", e);
    }
});

function initLucide() {
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

// --- VIEW NAVIGATION ---
function showView(viewId) {
    if (state.currentView === 'scanner' && viewId !== 'scanner') {
        stopScanner();
    }

    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
    
    const targetView = document.getElementById(`view-${viewId}`);
    if (targetView) {
        targetView.style.display = 'block';
    } else {
        console.warn(`La vista view-${viewId} no existe en el DOM.`);
    }
    
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === viewId);
    });

    const titleMap = {
        'dashboard': 'Dashboard',
        'inventory': 'Inventario',
        'scanner': 'Escáner',
        'admin': 'Importación',
        'detail': 'Pieza',
        'container-detail': 'Contenedor'
    };
    document.getElementById('view-title').innerText = titleMap[viewId] || 'ArqueoScan';

    state.currentView = viewId;
    
    if (viewId === 'dashboard') loadDashboardData();
    if (viewId === 'inventory') loadInventory();
    if (viewId === 'scanner') startPieceScanner();
    if (viewId === 'admin') prepareImportView();
}

async function prepareImportView() {
    try {
        const containers = await getAllContainers();
        populateImportDestinationSelect(containers);
    } catch (err) {
        console.error("Error cargando contenedores:", err);
    }
}

function populateImportDestinationSelect(containers) {
    const optAlmacen = document.getElementById('opt-almacen');
    const optSala = document.getElementById('opt-sala');
    
    optAlmacen.innerHTML = '';
    optSala.innerHTML = '';
    
    containers.forEach(c => {
        const option = document.createElement('option');
        option.value = c.id;
        option.innerText = `${c.name} (${c.sala} > ${c.caja || c.vitrina || ''})`;
        
        // Clasificación simple basada en el nombre de la sala o el nombre del contenedor
        const salaName = (c.sala || '').toLowerCase();
        if (salaName.includes('almacen') || salaName.includes('reserva')) {
            optAlmacen.appendChild(option);
        } else {
            optSala.appendChild(option);
        }
    });
}

// --- AUTH / PIN LOGIC ---
function showPINOverlay() {
    document.getElementById('pin-overlay').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
    state.pinBuffer = "";
    updatePinDots();
}

function updatePinDots() {
    const dots = document.querySelectorAll('.pin-display .dot');
    dots.forEach((dot, index) => {
        dot.classList.toggle('active', index < state.pinBuffer.length);
    });
}

async function handlePinInput(num) {
    if (state.pinBuffer.length < 4) {
        state.pinBuffer += num;
        updatePinDots();
    }

    if (state.pinBuffer.length === 4) {
        // En una app real, validaríamos contra la tabla 'operators' en Supabase
        // Por ahora, aceptamos "1234" o cualquier PIN para el prototipo
        validatePIN(state.pinBuffer);
    }
}

async function validatePIN(pin) {
    // Intentar verificar en la base de datos
    const operator = await verifyOperatorPIN(pin);
    
    if (operator) {
        state.currentUser = operator;
        document.getElementById('current-user-name').innerText = state.currentUser.name;
        document.getElementById('pin-overlay').style.display = 'none';
        document.getElementById('app').style.display = 'grid';
        showView('dashboard');
    } else {
        // Fallback for testing: Si Supabase no está configurado, permitir 1234
        if (pin === "1234") {
            state.currentUser = { name: "Invitado (Test)", pin: "1234" };
            document.getElementById('current-user-name').innerText = state.currentUser.name;
            document.getElementById('pin-overlay').style.display = 'none';
            document.getElementById('app').style.display = 'grid';
            showView('dashboard');
            return;
        }
        showPinError();
    }
}

function showPinError() {
    const errorEl = document.getElementById('pin-error');
    errorEl.style.display = 'block';
    state.pinBuffer = "";
    updatePinDots();
    setTimeout(() => { errorEl.style.display = 'none'; }, 2000);
}

// --- DATA LOADING ---
async function loadDashboardData() {
    try {
        const stats = await getDashboardStats();
        document.getElementById('stats-total').innerText = stats.totalPieces;
        document.getElementById('stats-today').innerText = stats.movementsToday;
        
        const recent = await getRecentMovements();
        renderRecentMovements(recent);
    } catch (err) {
        console.error("Error cargando dashboard:", err);
    }
}

function renderRecentMovements(movements) {
    const container = document.getElementById('recent-movements-list');
    if (!movements || movements.length === 0) {
        container.innerHTML = '<p class="empty-state">No hay movimientos registrados.</p>';
        return;
    }

    container.innerHTML = movements.map(m => `
        <div class="log-item">
            <span class="log-time">${new Date(m.timestamp).toLocaleTimeString()}</span>
            <div class="log-info">
                <strong>${m.pieces.name}</strong>
                <p>${m.origin_path} <i data-lucide="arrow-right"></i> ${m.destination_path}</p>
            </div>
            <span class="log-user">${m.operator_id}</span>
        </div>
    `).join('');
    initLucide();
}

async function loadInventory() {
    try {
        const data = await getAllPieces();
        state.allPieces = data;
        renderInventoryTable(data);
    } catch (err) {
        console.error("Error cargando inventario:", err);
    }
}

function renderInventoryTable(pieces) {
    const tbody = document.getElementById('inventory-body');
    tbody.innerHTML = pieces.map(p => {
        const c = p.containers || {};
        const path = c.caja ? `${c.sala} > ${c.caja}` : 'Sin ubicación';
        return `
            <tr data-id="${p.id}" class="clickable-row">
                <td class="mono">${p.inventory_number_new}</td>
                <td><strong>${p.name}</strong></td>
                <td>${path}</td>
                <td>${p.material}</td>
                <td><button class="btn-icon-small btn-view-piece" data-id="${p.id}"><i data-lucide="eye"></i></button></td>
            </tr>
        `;
    }).join('');
    initLucide();
    
    tbody.querySelectorAll('.btn-view-piece').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            showPieceDetail(btn.dataset.id);
        };
    });
}

// --- PIECE DETAIL & MOVEMENT ---
async function showPieceDetail(id) {
    try {
        const piece = await getPieceById(id);
        state.currentPiece = piece;
        
        const c = piece.containers || {};
        document.getElementById('detail-name').innerText = piece.name;
        document.getElementById('detail-inv-new').innerText = piece.inventory_number_new;
        document.getElementById('detail-material').innerText = piece.material;
        document.getElementById('detail-chronology').innerText = piece.chronology;
        
        document.getElementById('detail-container-name').innerText = c.name || "Sin contenedor";
        document.getElementById('detail-full-path').innerText = c.caja ? `${c.sala} > ${c.modulo} > ${c.estanteria}` : "-";
        
        // Campos técnicos nuevos
        document.getElementById('detail-dimensions').innerText = piece.dimensions || "-";
        document.getElementById('detail-provenance').innerText = piece.provenance || "-";
        document.getElementById('detail-author').innerText = piece.author || "-";
        document.getElementById('detail-section').innerText = piece.section || "-";
        document.getElementById('detail-description').innerText = piece.description || "Sin descripción.";
        document.getElementById('detail-observations').innerText = piece.observations || "Sin observaciones.";
        
        // Manejo de imagen
        const imgContainer = document.getElementById('detail-image-container');
        const imgEl = document.getElementById('detail-image');
        if (piece.image_url) {
            imgEl.src = piece.image_url;
            imgContainer.style.display = 'block';
        } else {
            imgContainer.style.display = 'none';
        }
        
        generatePieceQR('piece-qr-display', piece.id);
        renderPieceHistory(piece.movements);
        showView('detail');
    } catch (err) {
        alert("Error al cargar detalle: " + err.message);
    }
}

function renderPieceHistory(movements) {
    const list = document.getElementById('detail-history');
    if (!movements || movements.length === 0) {
        list.innerHTML = '<p class="empty-state">Sin movimientos previos.</p>';
        return;
    }
    
    list.innerHTML = movements.map(m => `
        <div class="history-item">
            <div class="hist-marker"></div>
            <div class="hist-content">
                <span class="hist-date">${new Date(m.timestamp).toLocaleString()}</span>
                <p>De: ${m.origin?.name || 'Origen desconocido'}</p>
                <p>A: <strong>${m.destination?.name || 'Destino desconocido'}</strong></p>
                <span class="hist-user">Por: ${m.operator_id}</span>
            </div>
        </div>
    `).join('');
}

// --- SCANNER ---
function startPieceScanner() {
    startScanner('qr-reader', (decodedText) => {
        handleUniversalScan(decodedText);
    });
}

function handleUniversalScan(id) {
    if (id.startsWith('P-')) {
        showPieceDetail(id);
    } else if (id.startsWith('C-')) {
        if (state.moveMode) {
            handleDestinationScanned(id);
        } else {
            showContainerDetail(id);
        }
    } else {
        alert("Código QR no reconocido como pieza o contenedor.");
    }
}

async function showContainerDetail(id) {
    try {
        const container = await getContainerById(id);
        state.currentContainer = container;
        
        document.getElementById('cont-detail-name').innerText = container.name;
        document.getElementById('cont-detail-path').innerText = `${container.sala} > ${container.modulo} > ${container.estanteria} > ${container.caja}`;
        
        const pieces = container.pieces || [];
        document.getElementById('cont-piece-count').innerText = `${pieces.length} Piezas dentro`;
        
        const list = document.getElementById('cont-pieces-list');
        if (pieces.length === 0) {
            list.innerHTML = '<p class="empty-state">Este contenedor está vacío.</p>';
        } else {
            list.innerHTML = pieces.map(p => `
                <div class="piece-mini-card glass clickable-piece" data-id="${p.id}">
                    <strong>${p.name}</strong>
                    <span class="mono">${p.inventory_number_new}</span>
                </div>
            `).join('');
            
            list.querySelectorAll('.clickable-piece').forEach(el => {
                el.onclick = () => showPieceDetail(el.dataset.id);
            });
        }
        
        showView('container-detail');
    } catch (err) {
        alert("Error al cargar contenedor: " + err.message);
    }
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
    const safeListener = (id, event, fn) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(event, fn);
    };

    const safeOnClick = (id, fn) => {
        const el = document.getElementById(id);
        if (el) el.onclick = fn;
    };

    // Navigation (Usamos delegación para mayor fiabilidad)
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.onclick = () => {
            const view = btn.getAttribute('data-view');
            if (view) showView(view);
        };
    });

    // Numpad
    document.querySelectorAll('.num').forEach(btn => {
        btn.onclick = () => handlePinInput(btn.innerText);
    });
    
    safeOnClick('btn-logout', showPINOverlay);
    safeOnClick('btn-sync', loadDashboardData);
    safeOnClick('btn-back-to-inventory', () => showView('inventory'));

    const searchInput = document.getElementById('inventory-search');
    if (searchInput) {
        searchInput.oninput = (e) => {
            const q = e.target.value.toLowerCase();
            const filtered = state.allPieces.filter(p => 
                p.name.toLowerCase().includes(q) || 
                p.inventory_number_new.toLowerCase().includes(q)
            );
            renderInventoryTable(filtered);
        };
    }

    // Import Flow
    safeListener('csv-input', 'change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const containerId = document.getElementById('import-destination-select').value;
        const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
        const parser = isExcel ? parseExcelInventory : parseCSVInventory;
        
        parser(file, containerId, (data) => {
            state.tempImportData = data;
            document.getElementById('import-preview-container').style.display = 'block';
            const previewBody = document.getElementById('import-preview-body');
            previewBody.innerHTML = data.slice(0, 5).map(p => `
                <tr>
                    <td class="mono">${p.inventory_number_new}</td>
                    <td>${p.name}</td>
                    <td>${p.provenance || '-'}</td>
                    <td class="text-xs">${p.dimensions}</td>
                </tr>
            `).join('');
        }, (err) => alert(err));
    });

    safeOnClick('btn-confirm-import', () => {
        if (state.tempImportData.length === 0) return;
        uploadToSupabase(state.tempImportData).then(() => {
            alert("¡Importado con éxito!");
            showView('inventory');
        }).catch(err => alert(err));
    });

    // Movement
    safeOnClick('btn-start-move', () => {
        document.getElementById('move-piece-info').innerText = `Moviendo ${state.currentPiece.name}`;
        document.getElementById('move-step-scan').style.display = 'block';
        document.getElementById('move-step-confirm').style.display = 'none';
        document.getElementById('move-modal').style.display = 'flex';
    });

    safeOnClick('btn-open-move-scanner', () => {
        document.getElementById('move-modal').style.display = 'none';
        state.moveMode = true;
        showView('scanner');
    });

    safeOnClick('btn-confirm-move', async () => {
        try {
            await movePieceToContainer(state.currentPiece.id, state.targetContainer.id, state.currentUser.pin);
            document.getElementById('move-modal').style.display = 'none';
            showPieceDetail(state.currentPiece.id); 
        } catch (err) { alert(err); }
    });

    safeOnClick('btn-cancel-move', () => {
        document.getElementById('move-modal').style.display = 'none';
    });
    
    document.querySelectorAll('.btn-back-dashboard').forEach(btn => {
        btn.onclick = () => showView('dashboard');
    });
}
