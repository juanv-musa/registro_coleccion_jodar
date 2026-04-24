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
    targetContainer: null,
    filteredPieces: null,
    allLocations: [],
    filteredLocations: null
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
        'container-detail': 'Contenedor',
        'locations': 'Ubicaciones',
        'users': 'Usuarios'
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
    if (viewId === 'users') loadUsers();
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
        
        // Manejar respuesta si viene como objeto o como array (caso especial de Supabase)
        const pieceData = Array.isArray(m.pieces) ? m.pieces[0] : m.pieces;
        const pieceName = pieceData?.objeto || pieceData?.name || "Pieza desconocida";
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
    
    const query = queryEl.value.toLowerCase().trim();
    if (!query) {
        renderInventoryTable(state.allPieces);
        return;
    }
    
    const filtered = state.allPieces.filter(p => {
        const nameStr = (p.name || '').toString().toLowerCase();
        const objetoStr = (p.objeto || '').toString().toLowerCase();
        const searchStr = [
            nameStr, 
            objetoStr, 
            p.inventory_number_new, 
            p.inventory_number_old, 
            p.material, 
            p.provenance,
            p.chronology
        ].map(v => (v || '').toString().toLowerCase()).join(' ');
        
        return searchStr.includes(query);
    });
    state.filteredPieces = filtered;
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
        const p = await getPieceById(id);
        state.currentPiece = p;
        
        const c = p.containers || {};
        
        // El título principal es el Objeto, el secundario es la Denominación
        const mainTitle = p.objeto || p.name || 'Sin nombre';
        document.getElementById('detail-name').innerText = mainTitle;
        const denEl = document.getElementById('detail-denominacion');
        if (denEl) {
            denEl.innerText = (p.name && p.name !== mainTitle && p.name !== 'Sin nombre') ? `Denominación: ${p.name}` : '';
        }
        
        document.getElementById('detail-inv-new').innerText = p.inventory_number_new || p.id;
        document.getElementById('detail-material').innerText = p.material || "-";
        document.getElementById('detail-chronology').innerText = p.chronology || "-";
        
        document.getElementById('detail-container-name').innerText = c.name || "Sin contenedor";
        document.getElementById('detail-full-path').innerText = c.caja ? `${c.sala} > ${c.modulo} > ${c.estanteria}` : "-";
        
        // Campos técnicos nuevos
        document.getElementById('detail-dimensions').innerText = p.dimensions || "-";
        document.getElementById('detail-provenance').innerText = p.provenance || "-";
        document.getElementById('detail-author').innerText = p.author || "-";
        document.getElementById('detail-section').innerText = p.section || "-";
        document.getElementById('detail-description').innerText = p.description || "Sin descripción.";
        document.getElementById('detail-observations').innerText = p.observations || "Sin observaciones.";
        
        // Manejo de imagen
        const imgContainer = document.getElementById('detail-image-container');
        const imgEl = document.getElementById('detail-image');
        if (p.image_url) {
            imgEl.src = p.image_url;
            imgContainer.style.display = 'block';
        } else {
            imgContainer.style.display = 'none';
        }
        
        generatePieceQR('piece-qr-display', p.id);
        renderPieceHistory(p.movements);
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
            list.innerHTML = pieces.map(p => {
                const imgTag = p.image_url 
                    ? `<img src="${p.image_url}" class="container-piece-img" alt="Foto">` 
                    : `<div class="container-piece-img-placeholder"><i data-lucide="image"></i></div>`;
                return `
                <div class="container-piece-item clickable-piece" data-id="${p.id}">
                    ${imgTag}
                    <div class="container-piece-info">
                        <h4>${p.objeto || p.name || 'Sin nombre'}</h4>
                        <p><strong>Nº Inv:</strong> <span class="mono">${p.inventory_number_new || p.id}</span></p>
                    </div>
                    <i data-lucide="chevron-right" style="color:var(--primary);"></i>
                </div>
            `}).join('');
            
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
    safeOnClick('btn-print-qr', () => { if(window.printPieceQR) window.printPieceQR(); });

    // El buscador ya tiene oninput en el HTML llamando a window.filterInventory()
    // Eliminamos el listener redundante aquí para evitar conflictos.

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
            
            // Recargar todo para asegurar que se vea el cambio
            await loadInventory();
            await loadDashboardData();
            await showPieceDetail(state.currentPiece.id); 
            
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

    // Formulario de nueva ubicación y usuario
    safeListener('form-add-container', 'submit', handleAddContainer);
    safeListener('form-add-user', 'submit', handleAddUser);

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
    document.getElementById('modal-container-title').innerText = "Nueva Ubicación";
    document.getElementById('btn-submit-container').innerText = "Crear Ubicación";
    document.getElementById('edit-cont-id').value = "";
    document.getElementById('form-add-container').reset();
    document.getElementById('add-container-modal').style.display = 'flex';
};

window.closeAddContainerModal = function() {
    document.getElementById('add-container-modal').style.display = 'none';
    document.getElementById('form-add-container').reset();
    document.getElementById('edit-cont-id').value = "";
};

window.showEditLocationModal = async function(id) {
    try {
        // Obtenemos los datos actuales
        const container = await getContainerById(id);
        if (!container) throw new Error("No se encontró la ubicación");
        
        // Rellenamos el formulario
        document.getElementById('edit-cont-id').value = container.id;
        document.getElementById('new-cont-name').value = container.name || '';
        document.getElementById('new-cont-sala').value = container.sala || '';
        document.getElementById('new-cont-modulo').value = container.modulo || '';
        document.getElementById('new-cont-estanteria').value = container.estanteria || '';
        document.getElementById('new-cont-balda').value = container.balda || '';
        
        // Ajustamos la UI del modal
        document.getElementById('modal-container-title').innerText = "Editar Ubicación";
        document.getElementById('btn-submit-container').innerText = "Guardar Cambios";
        document.getElementById('add-container-modal').style.display = 'flex';
    } catch (err) {
        console.error(err);
        alert("Error al cargar la ubicación para editar.");
    }
};

// --- USUARIOS / OPERATORS ---
async function loadUsers() {
    try {
        const users = await getAllOperators();
        renderUsersGrid(users);
    } catch (err) {
        console.error("Error cargando usuarios:", err);
    }
}

function renderUsersGrid(users) {
    const list = document.getElementById('users-list');
    if (!list) return;

    if (!users || users.length === 0) {
        list.innerHTML = '<div class="glass p-2"><p class="empty-state">No hay usuarios creados.</p></div>';
        return;
    }

    list.innerHTML = users.map(u => `
        <div class="location-card glass">
            <div class="location-info">
                <h3><i data-lucide="${u.role === 'admin' ? 'shield' : 'user'}" style="margin-right: 0.5rem; vertical-align: middle;"></i> ${u.name}</h3>
                <p>Rol: ${u.role === 'admin' ? 'Administrador' : 'Operario'}</p>
                <div class="location-stats">
                    <span class="badge ${u.active ? '' : 'gold'}">${u.active ? 'Activo' : 'Inactivo'}</span>
                </div>
            </div>
            <div class="location-actions">
                <button class="btn-icon" onclick="window.toggleUserStatus('${u.id}', ${!u.active})" title="${u.active ? 'Desactivar' : 'Activar'}">
                    <i data-lucide="${u.active ? 'user-x' : 'user-check'}"></i>
                </button>
                <button class="btn-icon" onclick="window.deleteUser('${u.id}')" title="Eliminar permanentemente">
                    <i data-lucide="trash-2"></i>
                </button>
            </div>
        </div>
    `).join('');
    
    if (window.lucide) window.lucide.createIcons();
}

window.showAddUserModal = function() {
    document.getElementById('modal-user-title').innerText = "Nuevo Usuario";
    document.getElementById('btn-submit-user').innerText = "Crear Usuario";
    document.getElementById('edit-user-id').value = "";
    document.getElementById('form-add-user').reset();
    document.getElementById('add-user-modal').style.display = 'flex';
};

window.closeAddUserModal = function() {
    document.getElementById('add-user-modal').style.display = 'none';
    document.getElementById('form-add-user').reset();
};

async function handleAddUser(e) {
    e.preventDefault();
    const userData = {
        name: document.getElementById('new-user-name').value,
        pin: document.getElementById('new-user-pin').value,
        role: document.getElementById('new-user-role').value,
        active: true
    };
    
    try {
        await createOperator(userData);
        alert("Usuario guardado con éxito");
        window.closeAddUserModal();
        loadUsers();
    } catch(err) {
        alert("Error al guardar usuario: " + err.message);
    }
}

window.toggleUserStatus = async function(id, status) {
    try {
        await updateOperator(id, { active: status });
        loadUsers();
    } catch(err) {
        alert("Error: " + err.message);
    }
};

window.deleteUser = async function(id) {
    if (!confirm("¿Seguro que quieres borrar este usuario? Esta acción no se puede deshacer.")) return;
    try {
        await deleteOperator(id);
        loadUsers();
    } catch(err) {
        alert("Error al eliminar: " + err.message);
    }
};

async function handleAddContainer(e) {
    e.preventDefault();
    
    const editId = document.getElementById('edit-cont-id').value;
    const isEdit = !!editId;

    const containerData = {
        id: isEdit ? editId : `C-${Date.now()}`,
        name: document.getElementById('new-cont-name').value,
        sala: document.getElementById('new-cont-sala').value,
        modulo: document.getElementById('new-cont-modulo').value || null,
        estanteria: document.getElementById('new-cont-estanteria').value || null,
        balda: document.getElementById('new-cont-balda').value || null,
        caja: document.getElementById('new-cont-name').value || null,
        updated_at: new Date()
    };

    try {
        await createContainer(containerData); // upsert handles both create and update
        alert(isEdit ? "Ubicación actualizada con éxito" : "Ubicación creada con éxito");
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
        state.allLocations = containers;
        renderLocationsGrid(containers);
    } catch (err) {
        console.error("Error cargando ubicaciones:", err);
    }
}

window.filterLocations = function() {
    const queryEl = document.getElementById('locations-search');
    if (!queryEl) return;
    const query = queryEl.value.toLowerCase().trim();
    if (!query) {
        state.filteredLocations = null;
        renderLocationsGrid(state.allLocations);
        return;
    }
    const filtered = state.allLocations.filter(c => {
        const str = [c.name, c.sala, c.modulo, c.estanteria, c.caja].map(v => (v||'').toString().toLowerCase()).join(' ');
        return str.includes(query);
    });
    state.filteredLocations = filtered;
    renderLocationsGrid(filtered);
};

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
                    <button class="btn-icon" onclick="window.showEditLocationModal('${c.id}')" title="Editar">
                        <i data-lucide="edit-3"></i>
                    </button>
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
    const piecesToExport = state.filteredPieces || state.allPieces;
    const data = piecesToExport.map(p => ({
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
