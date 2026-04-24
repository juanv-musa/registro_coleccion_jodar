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
    tempImportData: [],
    moveMode: false,
    targetContainer: null
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
    
    // Cerrar sidebar en móvil al cambiar de vista
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.classList.remove('active');

    if (viewId === 'dashboard') loadDashboardData();
    if (viewId === 'inventory') loadInventory();
    if (viewId === 'scanner') startPieceScanner();
    if (viewId === 'admin') prepareImportView();
}

async function prepareImportView() {
    if (typeof dbClient === 'undefined' || !dbClient) return;
    
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
    if (typeof dbClient === 'undefined' || !dbClient) {
        console.log("Dashboard esperando a Supabase...");
        return;
    }

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
    console.log("Renderizando movimientos:", movements);
    const container = document.getElementById('recent-movements-list');
    if (!container) return;
    
    if (!movements || movements.length === 0) {
        container.innerHTML = '<p class="empty-state">No hay movimientos registrados.</p>';
        return;
    }

    container.innerHTML = movements.map(m => {
        const date = new Date(m.timestamp);
        const day = date.getDate();
        const month = date.toLocaleString('es-ES', { month: 'short' });
        const time = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        
        const pieceName = m.pieces?.objeto || m.pieces?.name || "Pieza desconocida";
        const origin = m.origin?.name || "Origen";
        const destination = m.destination?.name || "Destino";

        return `
            <div class="log-item" onclick="window.showPieceDetail('${m.piece_id}')" style="cursor: pointer;">
                <div class="log-date-box">
                    <span class="day">${day}</span>
                    <span class="month">${month}</span>
                </div>
                <div class="log-info">
                    <strong>${pieceName}</strong>
                    <p>
                        <span>${origin}</span>
                        <i data-lucide="arrow-right"></i>
                        <strong>${destination}</strong>
                    </p>
                    <small style="opacity: 0.5; font-size: 0.7rem;">${time}</small>
                </div>
                <span class="log-user">${m.operator_id}</span>
            </div>
        `;
    }).join('');
    initLucide();
}

async function loadInventory() {
    if (typeof dbClient === 'undefined' || !dbClient) {
        console.log("Inventario esperando a Supabase...");
        return;
    }
    try {
        const data = await getAllPieces();
        
        // Ordenar correlativamente por número de inventario (Nº Inv)
        const sorted = data.sort((a, b) => {
            const valA = (a.inventory_number_new || "").toString();
            const valB = (b.inventory_number_new || "").toString();
            return valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
        });

        state.allPieces = sorted;
        renderInventoryTable(sorted);
    } catch (err) {
        console.error("Error cargando inventario:", err);
    }
}

function renderInventoryTable(pieces) {
    const tbody = document.getElementById('inventory-body');
    if (!tbody) return;

    tbody.innerHTML = pieces.map(p => {
        const c = p.containers || {};
        const path = c.caja ? `${c.sala} > ${c.caja}` : 'Sin ubicación';
        const photo = p.image_url ? `<img src="${p.image_url}" class="table-thumb" onerror="this.src='img/placeholder.jpg'">` : '<div class="no-photo-thumb"></div>';
        
        return `
            <tr onclick="window.showPieceDetail('${p.id}')" style="cursor: pointer;">
                <td><span class="badge-id">${p.inventory_number_new || p.id}</span></td>
                <td class="mono">${p.inventory_number_old || '-'}</td>
                <td>${photo}</td>
                <td><strong>${p.objeto || p.name}</strong></td>
                <td>${p.material || '-'}</td>
                <td><span class="location-tag">${path}</span></td>
            </tr>
        `;
    }).join('');
    
    if (window.lucide) window.lucide.createIcons();
}

function filterInventory() {
    const queryEl = document.getElementById('inventory-search');
    if (!queryEl) return;
    
    const query = queryEl.value.toLowerCase();
    const filtered = state.allPieces.filter(p => {
        const text = [
            p.name, 
            p.objeto, 
            p.inventory_number_new, 
            p.inventory_number_old, 
            p.material, 
            p.provenance
        ].join(' ').toLowerCase();
        return text.includes(query);
    });
    renderInventoryTable(filtered);
}

let currentSort = { col: null, asc: true };
function sortInventory(col) {
    if (currentSort.col === col) {
        currentSort.asc = !currentSort.asc;
    } else {
        currentSort.col = col;
        currentSort.asc = true;
    }

    const sorted = [...state.allPieces].sort((a, b) => {
        let valA = (a[col] || '').toString();
        let valB = (b[col] || '').toString();
        
        // Usar numeric: true para que "2" venga antes que "10"
        return currentSort.asc 
            ? valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' })
            : valB.localeCompare(valA, undefined, { numeric: true, sensitivity: 'base' });
    });

    renderInventoryTable(sorted);
}

window.filterInventory = filterInventory;
window.sortInventory = sortInventory;
window.renderInventoryTable = renderInventoryTable;

// --- PIECE DETAIL & MOVEMENT ---
async function showPieceDetail(id) {
    try {
        const piece = await getPieceById(id);
        state.currentPiece = piece;
        
        const c = piece.containers || {};
        document.getElementById('detail-name').innerText = piece.objeto || piece.name;
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

async function handleDestinationScanned(id) {
    try {
        const container = await getContainerById(id);
        if (!container) {
            alert("Contenedor no encontrado.");
            return;
        }
        
        state.targetContainer = container;
        state.moveMode = false;
        
        // Volver a la vista de detalle para que el modal se vea sobre la pieza
        showView('detail');
        
        document.getElementById('dest-name').innerText = container.name;
        document.getElementById('dest-path').innerText = `${container.sala} > ${container.modulo} > ${container.estanteria}`;
        
        document.getElementById('move-step-scan').style.display = 'none';
        document.getElementById('move-step-confirm').style.display = 'block';
        document.getElementById('move-modal').style.display = 'flex';
        document.getElementById('move-auth-pin').value = ""; // Asegurar que esté vacío
    } catch (err) {
        console.error(err);
        alert("Error al identificar destino: " + err.message);
    }
}

async function movePieceToContainer(pieceId, containerId, operatorPIN) {
    // Encontrar operador por PIN
    let operator = await verifyOperatorPIN(operatorPIN);
    
    // Fallback para pruebas si no hay conexión o es el PIN de test
    if (!operator && operatorPIN === "1234") {
        operator = { name: "Invitado (Test)" };
    }

    if (!operator) throw new Error("PIN de operador no válido para esta operación.");
    
    return await updatePieceLocation(pieceId, containerId, operator.name);
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
                (p.objeto && p.objeto.toLowerCase().includes(q)) ||
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
        }, (err) => {
            console.error(err);
            const msg = err && typeof err === 'object' ? (err.message || JSON.stringify(err)) : String(err);
            alert("Error al procesar archivo: " + msg);
        });
    });

    safeOnClick('btn-confirm-import', () => {
        if (state.tempImportData.length === 0) return;
        uploadToSupabase(state.tempImportData).then(() => {
            alert("¡Importado con éxito!");
            showView('inventory');
        }).catch(err => {
            console.error(err);
            const msg = err && typeof err === 'object' ? (err.message || JSON.stringify(err)) : String(err);
            alert("Error al subir a Supabase: " + msg);
        });
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
        const pin = document.getElementById('move-auth-pin').value;
        if (!pin) {
            alert("Introduce tu PIN para autorizar el movimiento.");
            return;
        }

        try {
            await movePieceToContainer(state.currentPiece.id, state.targetContainer.id, pin);
            document.getElementById('move-modal').style.display = 'none';
            document.getElementById('move-auth-pin').value = ""; // Limpiar
            showPieceDetail(state.currentPiece.id); 
            alert("¡Movimiento registrado con éxito!");
        } catch (err) { 
            console.error(err);
            const msg = err && typeof err === 'object' ? (err.message || JSON.stringify(err)) : String(err);
            alert("Error en el movimiento: " + msg); 
        }
    });

    safeOnClick('btn-cancel-move', () => {
        document.getElementById('move-modal').style.display = 'none';
    });
    
    document.querySelectorAll('.btn-back-dashboard').forEach(btn => {
        btn.onclick = () => showView('dashboard');
    });

    // Formulario de nueva ubicación
    safeListener('form-add-container', 'submit', handleAddContainer);

    // Toggle Sidebar para móvil
    safeOnClick('btn-menu-toggle', () => {
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) sidebar.classList.toggle('active');
    });

    // Cerrar sidebar al hacer click fuera en móvil
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 992) {
            const sidebar = document.querySelector('.sidebar');
            const toggleBtn = document.getElementById('btn-menu-toggle');
            if (sidebar && sidebar.classList.contains('active') && 
                !sidebar.contains(e.target) && !toggleBtn.contains(e.target)) {
                sidebar.classList.remove('active');
            }
        }
    });
}

// --- LOCATIONS & CONTAINERS ---
window.showAddContainerModal = function() {
    document.getElementById('add-container-modal').style.display = 'flex';
};

window.closeAddContainerModal = function() {
    document.getElementById('add-container-modal').style.display = 'none';
    document.getElementById('form-add-container').reset();
};

async function handleAddContainer(e) {
    e.preventDefault();
    
    const containerData = {
        id: `C-${Date.now()}`,
        name: document.getElementById('new-cont-name').value,
        sala: document.getElementById('new-cont-sala').value,
        modulo: document.getElementById('new-cont-modulo').value || null,
        estanteria: document.getElementById('new-cont-estanteria').value || null,
        balda: document.getElementById('new-cont-balda').value || null,
        caja: document.getElementById('new-cont-caja').value || null,
        updated_at: new Date()
    };

    try {
        await createContainer(containerData);
        alert("Ubicación creada con éxito");
        closeAddContainerModal();
        loadLocations(); // Recargar la lista
    } catch (err) {
        console.error(err);
        const msg = err && typeof err === 'object' ? (err.message || JSON.stringify(err)) : String(err);
        alert("Error al crear ubicación: " + msg);
    }
}

async function loadLocations() {
    if (typeof dbClient === 'undefined' || !dbClient) return;
    try {
        const containers = await getAllContainers();
        renderLocationsGrid(containers);
    } catch (err) {
        console.error("Error cargando ubicaciones:", err);
    }
}

function renderLocationsGrid(containers) {
    const list = document.getElementById('locations-list');
    if (!list) return;

    if (!containers || containers.length === 0) {
        list.innerHTML = '<p class="empty-state">No hay ubicaciones creadas. Pulsa "Nueva Ubicación" para empezar.</p>';
        return;
    }

    list.innerHTML = containers.map(c => {
        const pieceCount = c.pieces ? c.pieces.length : 0;
        return `
            <div class="location-card glass">
                <div class="location-qr-preview" id="qr-preview-${c.id}"></div>
                <div class="location-info">
                    <h3>${c.name || c.id}</h3>
                    <p>${c.sala || ''} > ${c.modulo || ''}</p>
                    <div class="location-stats">
                        <span class="badge"><i data-lucide="package"></i> ${pieceCount} piezas</span>
                    </div>
                </div>
                <div class="location-actions">
                    <button class="btn-icon" onclick="showContainerDetail('${c.id}')" title="Ver contenido">
                        <i data-lucide="eye"></i>
                    </button>
                    <button class="btn-icon" onclick="window.downloadContainerQR('${c.id}', '${c.name || 'Caja'}')" title="Descargar QR">
                        <i data-lucide="download"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
    
    // Generar previews de QR (después de que el DOM exista)
    containers.forEach(c => {
        if (window.generateContainerQRPreview) {
            window.generateContainerQRPreview(`qr-preview-${c.id}`, c.id);
        }
    });

    if (window.lucide) window.lucide.createIcons();
}

// --- EXPORTS ---
function exportToCSV(filename, data) {
    if (!data || !data.length) return;
    
    const headers = Object.keys(data[0]).join(';');
    const rows = data.map(row => 
        Object.values(row).map(val => `"${(val || '').toString().replace(/"/g, '""')}"`).join(';')
    );
    
    // Usar semicolon y BOM para que Excel lo abra bien en español
    const csvContent = "\uFEFF" + headers + "\n" + rows.join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

window.exportInventory = () => {
    const data = state.allPieces.map(p => ({
        "ID": p.id,
        "Num_Inv_Nuevo": p.inventory_number_new,
        "Num_Inv_Antiguo": p.inventory_number_old,
        "Objeto": p.objeto || p.name,
        "Material": p.material,
        "Cronologia": p.chronology,
        "Ubicacion": p.containers ? p.containers.name : "Sin ubicación",
        "Sala": p.containers ? p.containers.sala : "-"
    }));
    exportToCSV("Inventario_ArqueoScan.csv", data);
};

window.exportMovements = async () => {
    try {
        const movements = await getAllMovements();
        const data = movements.map(m => ({
            "Fecha": new Date(m.timestamp).toLocaleDateString(),
            "Hora": new Date(m.timestamp).toLocaleTimeString(),
            "Pieza": m.pieces?.objeto || m.pieces?.name || "Desconocida",
            "Num_Inv": m.pieces?.inventory_number_new || "-",
            "Origen": m.origin ? `${m.origin.sala} > ${m.origin.name}` : "Origen desconocido",
            "Destino": m.destination ? `${m.destination.sala} > ${m.destination.name}` : "Destino desconocido",
            "Operador": m.operator_id
        }));
        exportToCSV("Movimientos_ArqueoScan.csv", data);
    } catch (e) {
        alert("Error al exportar movimientos");
    }
};

window.exportLocations = async () => {
    try {
        const containers = await getAllContainers();
        const data = containers.map(c => ({
            "ID": c.id,
            "Nombre": c.name,
            "Sala": c.sala,
            "Modulo": c.modulo,
            "Estanteria": c.estanteria,
            "Caja": c.caja
        }));
        exportToCSV("Ubicaciones_ArqueoScan.csv", data);
    } catch (e) {
        alert("Error al exportar ubicaciones");
    }
};

// Global exposure
window.loadLocations = loadLocations;

// Modificar showView para incluir la nueva vista
const originalShowView = window.showView;
window.showView = (viewId, loadData = true) => {
    if (originalShowView) originalShowView(viewId, loadData);
    if (viewId === 'locations') loadLocations();
};
