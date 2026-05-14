/**
 * ArcheoScan Pro - Main App Controller
 */

// --- APP STATE ---
const state = {
    currentUser: null,
    currentView: 'dashboard',
    currentPiece: null,
    currentContainer: null,
    currentRoom: null,
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
    filteredLocations: null,
    locationTypeFilter: 'all',
    locationSubtypeFilter: null,
    previousContainerView: null,   // para saber si volver a la sala o a la lista
    selectedPieces: new Set(),
    selectedLocations: new Set()
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    // Inicializar UI básica
    try {
        initLucide();
        setupEventListeners();
    } catch (e) {
        console.error("Error al configurar botones:", e);
    }

    // Inicializar Supabase
    try {
        initSupabase();
        
        // Verificar sesión inicial
        const session = await getSession();
        if (session) {
            console.log("Sesión activa detectada.");
            state.currentUser = session.user;
        } else {
            showLoginOverlay();
        }
    } catch (e) {
        console.error("Error en inicialización:", e);
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
        'users': 'Operarios'
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

// --- AUTH / SESSION LOGIC (SUPABASE AUTH) ---

function showLoginOverlay() {
    const loginEl = document.getElementById('login-overlay');
    const appEl = document.getElementById('app');
    if (loginEl) loginEl.style.display = 'flex';
    if (appEl) appEl.style.display = 'none';
}

function hideLoginOverlay() {
    const loginEl = document.getElementById('login-overlay');
    const appEl = document.getElementById('app');
    if (loginEl) loginEl.style.display = 'none';
    if (appEl) appEl.style.display = 'grid';
}

window.handleAuthStateChange = function(event, session) {
    if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        if (session) {
            state.currentUser = session.user;
            document.getElementById('current-user-name').innerText = session.user.email;
            hideLoginOverlay();
            showView('dashboard');
        }
    } else if (event === 'SIGNED_OUT') {
        state.currentUser = null;
        showLoginOverlay();
    }
};

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');

    try {
        errorEl.style.display = 'none';
        await signIn(email, password);
        // El handleAuthStateChange se encargará de redirigir
    } catch (err) {
        console.error("Login Error:", err);
        errorEl.style.display = 'block';
        errorEl.innerText = "Error: " + (err.message || "Credenciales inválidas");
    }
}

async function handleLogout() {
    if (confirm("¿Estás seguro de que quieres cerrar sesión?")) {
        await signOut();
    }
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
        
        // Criterio de imagen: URL > Nº Inv Nuevo > Nº Inv Antiguo (NIM)
        const imgNew = p.inventory_number_new ? `img/${p.inventory_number_new}.jpg` : '';
        const imgOld = p.inventory_number_old ? `img/${p.inventory_number_old}.jpg` : '';
        const initialSrc = p.image_url || imgNew || imgOld || 'img/placeholder.jpg';
        
        const photo = `<img src="${initialSrc}" class="table-thumb" 
            onerror="if(this.src.includes('${p.inventory_number_new}')) { this.src='${imgOld || 'img/placeholder.jpg'}'; } 
                     else if(this.src.includes('${p.inventory_number_old}')) { this.src='img/placeholder.jpg'; } 
                     else { this.src='${imgNew || imgOld || 'img/placeholder.jpg'}'; }">`;
        
        return `
            <tr style="cursor: pointer;">
                <td onclick="event.stopPropagation()"><input type="checkbox" class="piece-checkbox" data-id="${p.id}" ${state.selectedPieces.has(p.id) ? 'checked' : ''} onchange="window.togglePieceSelection('${p.id}', this.checked)"></td>
                <td onclick="window.showPieceDetail('${p.id}')"><span class="badge-id">${p.inventory_number_new || p.id}</span></td>
                <td onclick="window.showPieceDetail('${p.id}')" class="mono">${p.inventory_number_old || '-'}</td>
                <td onclick="window.showPieceDetail('${p.id}')">${photo}</td>
                <td onclick="window.showPieceDetail('${p.id}')"><strong>${p.objeto || p.name}</strong></td>
                <td onclick="window.showPieceDetail('${p.id}')">${p.materia || '-'}</td>
                <td onclick="window.showPieceDetail('${p.id}')"><span class="location-tag">${path}</span></td>
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
            p.materia, 
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

window.renderInventoryTable = renderInventoryTable;
window.togglePieceSelection = function(id, isChecked) {
    if (isChecked) state.selectedPieces.add(id);
    else state.selectedPieces.delete(id);
    updatePieceBatchUI();
};

window.toggleSelectAllPieces = function(isChecked) {
    const pieces = state.filteredPieces || state.allPieces;
    pieces.forEach(p => {
        if (isChecked) state.selectedPieces.add(p.id);
        else state.selectedPieces.delete(p.id);
    });
    renderInventoryTable(pieces);
    updatePieceBatchUI();
};

window.clearPieceSelection = function() {
    state.selectedPieces.clear();
    const selectAll = document.getElementById('inventory-select-all');
    if (selectAll) selectAll.checked = false;
    renderInventoryTable(state.filteredPieces || state.allPieces);
    updatePieceBatchUI();
};

function updatePieceBatchUI() {
    const count = state.selectedPieces.size;
    const bar = document.getElementById('inventory-batch-actions');
    const countEl = document.getElementById('selected-pieces-count');
    if (bar && countEl) {
        bar.style.display = count > 0 ? 'flex' : 'none';
        countEl.innerText = `${count} seleccionada${count !== 1 ? 's' : ''}`;
    }
}

window.startBatchMove = function() {
    const count = state.selectedPieces.size;
    document.getElementById('move-piece-info').innerText = `Moviendo ${count} piezas seleccionadas`;
    document.getElementById('move-step-scan').style.display = 'block';
    document.getElementById('move-step-confirm').style.display = 'none';
    
    const btnRemove = document.getElementById('btn-remove-location');
    if (btnRemove) btnRemove.style.display = 'block';
    
    document.getElementById('move-modal').style.display = 'flex';
};

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
        document.getElementById('detail-materia').innerText = p.materia || "-";
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
        
        // Manejo de imagen: Criterio URL > Nº Inv Nuevo > Nº Inv Antiguo (NIM)
        const imgContainer = document.getElementById('detail-image-container');
        const imgEl = document.getElementById('detail-image');
        
        const imgNew = p.inventory_number_new ? `img/${p.inventory_number_new}.jpg` : '';
        const imgOld = p.inventory_number_old ? `img/${p.inventory_number_old}.jpg` : '';
        
        imgEl.src = p.image_url || imgNew || imgOld || 'img/placeholder.jpg';
        
        imgEl.onerror = () => {
            if (imgEl.src.includes(p.inventory_number_new) && imgOld) {
                imgEl.src = imgOld;
            } else {
                imgContainer.style.display = 'none';
            }
        };
        imgContainer.style.display = 'block';
        
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
    } else if (id.startsWith('S-')) {
        // QR de sala/habitación
        const salaSlug = id.replace('S-', '');
        showRoomDetailBySlug(salaSlug);
    } else if (id.startsWith('C-')) {
        if (state.moveMode) {
            handleDestinationScanned(id);
        } else {
            showContainerDetail(id);
        }
    } else {
        alert("Código QR no reconocido. Asegúrate de escanear un QR de ArqueoScan.");
    }
}

async function showContainerDetail(id) {
    try {
        const container = await getContainerById(id);
        state.currentContainer = container;
        
        // Icono y tipo según container_type
        const typeInfo = getContainerTypeInfo(container.container_type || 'caja');
        const iconEl = document.getElementById('cont-type-icon');
        const labelEl = document.getElementById('cont-type-label');
        if (iconEl) iconEl.innerHTML = `<i data-lucide="${typeInfo.icon}"></i>`;
        if (labelEl) labelEl.innerText = typeInfo.label;

        document.getElementById('cont-detail-name').innerText = container.name;
        
        // Ruta según tipo de espacio
        let pathParts = [container.sala];
        if (container.modulo) pathParts.push(container.modulo);
        if (container.estanteria) pathParts.push(container.estanteria);
        if (container.balda) pathParts.push(container.balda);
        document.getElementById('cont-detail-path').innerText = pathParts.join(' > ');
        
        const pieces = container.pieces || [];
        document.getElementById('cont-piece-count').innerText = `${pieces.length} Pieza${pieces.length !== 1 ? 's' : ''} dentro`;
        
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
                el.onclick = () => {
                    state.previousView = 'container-detail';
                    showPieceDetail(el.dataset.id);
                };
            });
        }
        
        showView('container-detail');
        if (window.lucide) window.lucide.createIcons();
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

async function handleNoDestinationSelected() {
    state.targetContainer = null;
    state.moveMode = false;
    
    document.getElementById('dest-name').innerText = "SIN UBICACIÓN";
    document.getElementById('dest-path').innerText = "La pieza quedará registrada sin contenedor asignado.";
    
    document.getElementById('move-step-scan').style.display = 'none';
    document.getElementById('move-step-confirm').style.display = 'block';
    document.getElementById('move-modal').style.display = 'flex';
    document.getElementById('move-auth-pin').value = "";
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

    safeOnClick('btn-logout', handleLogout);
    safeListener('form-login', 'submit', handleLogin);
    safeOnClick('btn-sync', loadDashboardData);
    safeOnClick('btn-back-to-inventory', () => {
        if (state.previousView === 'container-detail') {
            state.previousView = null;
            showView('container-detail');
        } else {
            showView('inventory');
        }
    });
    safeOnClick('btn-print-qr', () => { if(window.printPieceQR) window.printPieceQR(); });

    // Volver desde detalle de contenedor: a sala si venimos de ahí, si no a ubicaciones
    safeOnClick('btn-back-from-container', () => {
        if (state.previousContainerView === 'room') {
            state.previousContainerView = null;
            showView('room-detail');
        } else {
            showView('locations');
        }
    });

    // Imprimir QR de sala
    safeOnClick('btn-print-room-qr', () => {
        if (state.currentRoom) {
            const slug = state.currentRoom.sala.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
            window.printRoomQR(slug, state.currentRoom.sala, state.currentRoom.space_type);
        }
    });

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
        document.getElementById('move-piece-info').innerText = `Moviendo ${state.currentPiece.objeto || state.currentPiece.name}`;
        document.getElementById('move-step-scan').style.display = 'block';
        document.getElementById('move-step-confirm').style.display = 'none';
        
        // Si ya no tiene ubicación, ocultamos el botón de quitar ubicación
        const btnRemove = document.getElementById('btn-remove-location');
        if (btnRemove) {
            btnRemove.style.display = state.currentPiece.container_id ? 'block' : 'none';
        }
        
        document.getElementById('move-modal').style.display = 'flex';
    });

    safeOnClick('btn-open-move-scanner', () => {
        document.getElementById('move-modal').style.display = 'none';
        state.moveMode = true;
        showView('scanner');
    });

    safeOnClick('btn-remove-location', () => {
        handleNoDestinationSelected();
    });

    safeOnClick('btn-confirm-move', async () => {
        const pin = document.getElementById('move-auth-pin').value;
        if (!pin) {
            alert("Introduce tu PIN para autorizar el movimiento.");
            return;
        }

        try {
            const destId = state.targetContainer ? state.targetContainer.id : null;
            
            if (state.selectedPieces.size > 0) {
                // Batch move
                const pieceIds = Array.from(state.selectedPieces);
                await batchMovePieces(pieceIds, destId, pin);
                window.clearPieceSelection();
            } else {
                // Single move
                await movePieceToContainer(state.currentPiece.id, destId, pin);
                await showPieceDetail(state.currentPiece.id); 
            }
            
            document.getElementById('move-modal').style.display = 'none';
            document.getElementById('move-auth-pin').value = ""; // Limpiar
            
            await loadInventory();
            await loadDashboardData();
            
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

    // Formulario de nueva ubicación, usuario y pieza
    safeListener('form-add-container', 'submit', handleAddContainer);
    safeListener('form-add-user', 'submit', handleAddUser);
    safeListener('form-add-piece', 'submit', handleAddPiece);

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
        list.innerHTML = '<div class="glass p-2"><p class="empty-state">No hay operarios creados.</p></div>';
        return;
    }

    list.innerHTML = users.map(u => `
        <div class="location-card glass">
            <div class="location-info">
                <h3><i data-lucide="user" style="margin-right: 0.5rem; vertical-align: middle;"></i> ${u.name}</h3>
                <div class="location-stats">
                    <span class="badge ${u.active ? '' : 'gold'}">${u.active ? 'Activo' : 'Inactivo'}</span>
                </div>
            </div>
            <div class="location-actions">
                <button class="btn-icon" onclick="window.editUser('${u.id}')" title="Editar">
                    <i data-lucide="edit-3"></i>
                </button>
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
    document.getElementById('modal-user-title').innerText = "Nuevo Operario";
    document.getElementById('btn-submit-user').innerText = "Crear Operario";
    document.getElementById('edit-user-id').value = "";
    document.getElementById('form-add-user').reset();
    document.getElementById('add-user-modal').style.display = 'flex';
};

// --- PIECES MANAGEMENT (NEW) ---
window.showAddPieceModal = function() {
    document.getElementById('modal-piece-title').innerText = "Nueva Pieza";
    document.getElementById('btn-submit-piece').innerText = "Crear Pieza";
    document.getElementById('edit-piece-id').value = "";
    document.getElementById('form-add-piece').reset();
    document.getElementById('add-piece-modal').style.display = 'flex';
};

window.closeAddPieceModal = function() {
    document.getElementById('add-piece-modal').style.display = 'none';
    document.getElementById('form-add-piece').reset();
};

window.showEditPieceModal = async function(id) {
    try {
        const p = await getPieceById(id);
        if (!p) throw new Error("No se encontró la pieza");
        
        document.getElementById('modal-piece-title').innerText = "Editar Pieza";
        document.getElementById('btn-submit-piece').innerText = "Guardar Cambios";
        document.getElementById('edit-piece-id').value = p.id;
        
        document.getElementById('piece-inv-new').value = p.inventory_number_new || '';
        document.getElementById('piece-inv-old').value = p.inventory_number_old || '';
        document.getElementById('piece-objeto').value = p.objeto || '';
        document.getElementById('piece-name').value = p.name || '';
        document.getElementById('piece-materia').value = p.materia || '';
        document.getElementById('piece-chronology').value = p.chronology || '';
        document.getElementById('piece-dimensions').value = p.dimensions || '';
        document.getElementById('piece-provenance').value = p.provenance || '';
        document.getElementById('piece-author').value = p.author || '';
        document.getElementById('piece-section').value = p.section || '';
        document.getElementById('piece-image-url').value = p.image_url || '';
        document.getElementById('piece-description').value = p.description || '';
        document.getElementById('piece-observations').value = p.observations || '';
        
        document.getElementById('add-piece-modal').style.display = 'flex';
    } catch (err) {
        console.error(err);
        alert("Error al cargar pieza: " + err.message);
    }
};

async function handleAddPiece(e) {
    e.preventDefault();
    const editId = document.getElementById('edit-piece-id').value;
    const isEdit = !!editId;
    
    const pieceData = {
        inventory_number_new: document.getElementById('piece-inv-new').value,
        inventory_number_old: document.getElementById('piece-inv-old').value,
        objeto: document.getElementById('piece-objeto').value,
        name: document.getElementById('piece-name').value,
        materia: document.getElementById('piece-materia').value,
        chronology: document.getElementById('piece-chronology').value,
        dimensions: document.getElementById('piece-dimensions').value,
        provenance: document.getElementById('piece-provenance').value,
        author: document.getElementById('piece-author').value,
        section: document.getElementById('piece-section').value,
        image_url: document.getElementById('piece-image-url').value,
        description: document.getElementById('piece-description').value,
        observations: document.getElementById('piece-observations').value,
        updated_at: new Date()
    };
    
    try {
        if (isEdit) {
            await updatePiece(editId, pieceData);
            alert("Pieza actualizada con éxito.");
            // Si estábamos en la vista de detalle, recargarla
            if (state.currentView === 'detail' && state.currentPiece.id === editId) {
                await showPieceDetail(editId);
            }
        } else {
            const newPiece = await createPiece(pieceData);
            alert("Pieza creada con éxito.");
            // Mostrar la nueva pieza si se desea o volver al inventario
            showPieceDetail(newPiece.id);
        }
        
        window.closeAddPieceModal();
        loadInventory();
        loadDashboardData();
    } catch (err) {
        console.error(err);
        alert("Error al guardar la pieza: " + err.message);
    }
}

window.handleDeletePiece = async function(id) {
    if (!confirm("¿Estás seguro de que quieres eliminar esta pieza permanentemente? Esta acción no se puede deshacer.")) return;
    
    try {
        await deletePiece(id);
        alert("Pieza eliminada con éxito.");
        showView('inventory');
        loadInventory();
        loadDashboardData();
    } catch (err) {
        console.error(err);
        alert("Error al eliminar la pieza: " + err.message);
    }
};

window.closeAddUserModal = function() {
    document.getElementById('add-user-modal').style.display = 'none';
    document.getElementById('form-add-user').reset();
};

async function handleAddUser(e) {
    e.preventDefault();
    const isEdit = !!document.getElementById('edit-user-id').value;
    const userId = document.getElementById('edit-user-id').value;
    
    // NOTA: Eliminamos 'role' temporalmente porque la tabla de Supabase no tiene esa columna creada.
    const userData = {
        name: document.getElementById('new-user-name').value,
        pin: document.getElementById('new-user-pin').value,
        active: true
    };
    
    try {
        if (isEdit) {
            await updateOperator(userId, userData);
            alert("Operario actualizado con éxito.");
        } else {
            await createOperator(userData);
            alert("Operario guardado con éxito.");
        }
        window.closeAddUserModal();
        loadUsers();
    } catch(err) {
        alert("Error al guardar operario: " + err.message);
    }
}

window.editUser = async function(id) {
    try {
        const users = await getAllOperators();
        const user = users.find(u => u.id === id || u.id === parseInt(id));
        if (!user) return;
        
        document.getElementById('modal-user-title').innerText = "Editar Operario";
        document.getElementById('btn-submit-user').innerText = "Guardar Cambios";
        document.getElementById('edit-user-id').value = user.id;
        document.getElementById('new-user-name').value = user.name;
        document.getElementById('new-user-pin').value = user.pin;
        
        document.getElementById('add-user-modal').style.display = 'flex';
    } catch(e) {
        console.error(e);
    }
};

window.toggleUserStatus = async function(id, status) {
    try {
        await updateOperator(id, { active: status });
        loadUsers();
    } catch(err) {
        alert("Error: " + err.message);
    }
};

window.deleteUser = async function(id) {
    if (!confirm("¿Seguro que quieres borrar este operario? Esta acción no se puede deshacer.")) return;
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
    const contType = document.getElementById('new-cont-type').value || 'caja';
    const spaceTypeEl = document.querySelector('input[name="space-type"]:checked');
    const spaceType = spaceTypeEl ? spaceTypeEl.value : 'almacen';

    const containerData = {
        id: isEdit ? editId : `C-${Date.now()}`,
        name: document.getElementById('new-cont-name').value,
        sala: document.getElementById('new-cont-sala').value,
        space_type: spaceType,
        container_type: contType,
        modulo: document.getElementById('new-cont-modulo')?.value || null,
        estanteria: document.getElementById('new-cont-estanteria')?.value || null,
        balda: document.getElementById('new-cont-balda')?.value || null,
        caja: document.getElementById('new-cont-name').value || null,
        updated_at: new Date()
    };

    try {
        await createContainer(containerData);
        alert(isEdit ? "Ubicación actualizada con éxito" : "Ubicación creada con éxito");
        closeAddContainerModal();
        loadLocations();
    } catch (err) {
        console.error(err);
        const msg = err && typeof err === 'object' ? (err.message || JSON.stringify(err)) : String(err);
        alert("Error al crear ubicación: " + msg);
    }
}

window.deleteLocation = async function(id, pieceCount) {
    if (pieceCount > 0) {
        if (!confirm(`Esta ubicación contiene ${pieceCount} piezas. Si la eliminas, las piezas se quedarán sin ubicación asignada. ¿Deseas continuar?`)) return;
    } else {
        if (!confirm("¿Estás seguro de que quieres eliminar esta ubicación?")) return;
    }

    try {
        await deleteContainer(id);
        alert("Ubicación eliminada con éxito.");
        loadLocations();
    } catch (err) {
        console.error(err);
        alert("Error al eliminar la ubicación: " + err.message);
    }
};

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
        const typeInfo = getContainerTypeInfo(c.container_type || 'caja');
        const spaceLabel = c.space_type === 'exposicion' ? 'Exposición' : 'Almacén';
        const spaceClass = c.space_type === 'exposicion' ? 'exposicion' : 'almacen';
        
        // Ruta corta
        let pathParts = [];
        if (c.modulo) pathParts.push(c.modulo);
        if (c.estanteria) pathParts.push(c.estanteria);
        if (c.balda) pathParts.push(c.balda);
        const subpath = pathParts.join(' > ');

        return `
            <div class="location-card glass" data-space-type="${c.space_type || 'almacen'}" data-container-type="${c.container_type || 'caja'}">
                <div class="location-card-selection">
                    <input type="checkbox" class="location-checkbox" data-id="${c.id}" ${state.selectedLocations.has(c.id) ? 'checked' : ''} onchange="window.toggleLocationSelection('${c.id}', this.checked)">
                </div>
                <div class="location-card-top">
                    <div class="location-type-icon ${spaceClass}">
                        <i data-lucide="${typeInfo.icon}"></i>
                    </div>
                    <div class="location-type-badges">
                        <span class="type-badge-space ${spaceClass}">${spaceLabel}</span>
                        <span class="type-badge-cont">${typeInfo.label}</span>
                    </div>
                </div>
                <div class="location-qr-preview" id="qr-preview-${c.id}"></div>
                <div class="location-info">
                    <h3>${c.name || c.id}</h3>
                    <p class="location-sala">${c.sala || ''}</p>
                    ${subpath ? `<p class="location-subpath">${subpath}</p>` : ''}
                    <div class="location-stats">
                        <span class="badge"><i data-lucide="gem"></i> ${pieceCount} pieza${pieceCount !== 1 ? 's' : ''}</span>
                    </div>
                </div>
                <div class="location-actions">
                    <button class="btn-icon" onclick="window.showEditLocationModal('${c.id}')" title="Editar">
                        <i data-lucide="edit-3"></i>
                    </button>
                    <button class="btn-icon" onclick="showContainerDetail('${c.id}')" title="Ver piezas">
                        <i data-lucide="eye"></i>
                    </button>
                    <button class="btn-icon" onclick="window.downloadContainerQR('${c.id}', '${(c.name || 'Caja').replace(/'/g, "\\'")}}')" title="Descargar QR">
                        <i data-lucide="download"></i>
                    </button>
                    <button class="btn-icon btn-danger" onclick="window.deleteLocation('${c.id}', ${pieceCount})" title="Eliminar ubicación">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
    
    // Generar previews de QR
    containers.forEach(c => {
        if (window.generateContainerQRPreview) {
            window.generateContainerQRPreview(`qr-preview-${c.id}`, c.id);
        }
    });

    if (window.lucide) window.lucide.createIcons();
}

window.toggleLocationSelection = function(id, isChecked) {
    if (isChecked) state.selectedLocations.add(id);
    else state.selectedLocations.delete(id);
    updateLocationBatchUI();
};

window.clearLocationSelection = function() {
    state.selectedLocations.clear();
    renderLocationsGrid(state.filteredLocations || state.allLocations);
    updateLocationBatchUI();
};

function updateLocationBatchUI() {
    const count = state.selectedLocations.size;
    const bar = document.getElementById('location-batch-actions');
    const countEl = document.getElementById('selected-locations-count');
    if (bar && countEl) {
        bar.style.display = count > 0 ? 'flex' : 'none';
        countEl.innerText = `${count} seleccionada${count !== 1 ? 's' : ''}`;
    }
}

// --- HELPERS DE TIPO DE CONTENEDOR ---
function getContainerTypeInfo(type) {
    const map = {
        'caja':       { icon: 'package',           label: 'Caja' },
        'balda':      { icon: 'layout-list',        label: 'Balda' },
        'estanteria': { icon: 'server',             label: 'Estantería' },
        'modulo':     { icon: 'grid-2x2',           label: 'Módulo' },
        'pale':       { icon: 'pallet',             label: 'Palé' },
        'vitrina':    { icon: 'picture-in-picture', label: 'Vitrina' },
        'peana':      { icon: 'cylinder',           label: 'Peana' },
        'pared':      { icon: 'image',              label: 'Pared' },
    };
    return map[type] || map['caja'];
}

// --- FILTROS DE UBICACIONES ---
window.setLocationFilter = function(type, btn) {
    state.locationTypeFilter = type;
    state.locationSubtypeFilter = null;
    
    // Limpiar chips de tipo principal
    document.querySelectorAll('.filter-chip[data-filter]').forEach(c => c.classList.remove('active'));
    if (btn) btn.classList.add('active');
    
    // Desactivar subtype chips
    document.querySelectorAll('.filter-chip[data-subfilter]').forEach(c => c.classList.remove('active'));
    
    applyLocationFilters();
};

window.setSubtypeFilter = function(subtype, btn) {
    // Toggle: si ya está activo, desactiva
    if (state.locationSubtypeFilter === subtype) {
        state.locationSubtypeFilter = null;
        if (btn) btn.classList.remove('active');
    } else {
        state.locationSubtypeFilter = subtype;
        document.querySelectorAll('.filter-chip[data-subfilter]').forEach(c => c.classList.remove('active'));
        if (btn) btn.classList.add('active');
    }
    applyLocationFilters();
};

function applyLocationFilters() {
    const query = (document.getElementById('locations-search')?.value || '').toLowerCase().trim();
    let filtered = state.allLocations;

    // Filtro por tipo de espacio
    if (state.locationTypeFilter && state.locationTypeFilter !== 'all') {
        filtered = filtered.filter(c => (c.space_type || 'almacen') === state.locationTypeFilter);
    }

    // Filtro por subtipo de contenedor
    if (state.locationSubtypeFilter) {
        filtered = filtered.filter(c => (c.container_type || 'caja') === state.locationSubtypeFilter);
    }

    // Filtro de búsqueda textual
    if (query) {
        filtered = filtered.filter(c => {
            const str = [c.name, c.sala, c.modulo, c.estanteria, c.container_type, c.space_type]
                .map(v => (v||'').toString().toLowerCase()).join(' ');
            return str.includes(query);
        });
    }

    state.filteredLocations = filtered;
    renderLocationsGrid(filtered);
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
        "Materia": p.materia,
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

window.exportSelectedLocations = async (format) => {
    if (state.selectedLocations.size === 0) return;
    
    const selectedIds = Array.from(state.selectedLocations);
    const locations = state.allLocations.filter(c => selectedIds.includes(c.id));
    
    if (format === 'csv') {
        const data = [];
        locations.forEach(c => {
            const pieces = c.pieces || [];
            if (pieces.length === 0) {
                data.push({
                    "Ubicación": c.name,
                    "Sala": c.sala,
                    "Nº Pieza": "-",
                    "Objeto": "Vacio",
                    "Materia": "-"
                });
            } else {
                pieces.forEach(p => {
                    data.push({
                        "Ubicación": c.name,
                        "Sala": c.sala,
                        "Nº Pieza": p.inventory_number_new,
                        "Objeto": p.objeto || p.name,
                        "Materia": p.materia || "-"
                    });
                });
            }
        });
        exportToCSV("Listado_Ubicaciones_Piezas.csv", data);
    } else if (format === 'pdf') {
        generatePrintView(locations);
    }
};

function generatePrintView(locations) {
    const printWindow = window.open('', '_blank');
    const html = `
        <html>
        <head>
            <title>Listado de Ubicaciones y Piezas</title>
            <style>
                body { font-family: 'Inter', sans-serif; padding: 20px; color: #333; }
                h1 { color: #8b7355; border-bottom: 2px solid #d4af37; padding-bottom: 10px; }
                .location-block { margin-bottom: 30px; page-break-inside: avoid; }
                .location-header { background: #f9f6f0; padding: 10px; border-radius: 5px; margin-bottom: 10px; }
                .location-header h2 { margin: 0; font-size: 1.2rem; }
                .location-header p { margin: 5px 0 0; font-size: 0.9rem; opacity: 0.7; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                th, td { border: 1px solid #eee; padding: 8px; text-align: left; vertical-align: middle; }
                th { background: #fafafa; font-size: 0.8rem; text-transform: uppercase; }
                .piece-img { width: 60px; height: 60px; object-fit: cover; border-radius: 4px; border: 1px solid #eee; }
                .no-pieces { font-style: italic; color: #999; padding: 10px; }
                @media print {
                    .no-print { display: none; }
                }
            </style>
        </head>
        <body>
            <div class="no-print" style="margin-bottom: 20px;">
                <button onclick="window.print()" style="padding: 10px 20px; background: #d4af37; color: white; border: none; border-radius: 5px; cursor: pointer;">Imprimir / Guardar PDF</button>
            </div>
            <h1>ArqueoScan | Listado de Inventario por Ubicación</h1>
            ${locations.map(c => `
                <div class="location-block">
                    <div class="location-header">
                        <h2>${c.name}</h2>
                        <p>${c.sala} ${c.modulo ? ' > ' + c.modulo : ''} ${c.estanteria ? ' > ' + c.estanteria : ''}</p>
                    </div>
                    ${(c.pieces && c.pieces.length > 0) ? `
                        <table>
                            <thead>
                                <tr>
                                    <th style="width: 70px;">Imagen</th>
                                    <th style="width: 120px;">Nº Inventario</th>
                                    <th>Objeto / Denominación</th>
                                    <th>Materia</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${c.pieces.map(p => {
                                    const imgNew = p.inventory_number_new ? `img/${p.inventory_number_new}.jpg` : '';
                                    const imgOld = p.inventory_number_old ? `img/${p.inventory_number_old}.jpg` : '';
                                    const imgSrc = p.image_url || imgNew || imgOld || 'img/placeholder.jpg';
                                    
                                    return `
                                    <tr>
                                        <td><img src="${imgSrc}" class="piece-img" onerror="this.src='img/placeholder.jpg'"></td>
                                        <td><strong>${p.inventory_number_new || '-'}</strong></td>
                                        <td>${p.objeto || p.name}</td>
                                        <td>${p.materia || '-'}</td>
                                    </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    ` : '<p class="no-pieces">No hay piezas en esta ubicación.</p>'}
                </div>
            `).join('')}
            <script>
                // Opcional: auto-print
                // window.onload = () => window.print();
            </script>
        </body>
        </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
}

async function batchMovePieces(pieceIds, containerId, operatorPIN) {
    let operator = await verifyOperatorPIN(operatorPIN);
    if (!operator && operatorPIN === "1234") {
        operator = { name: "Invitado (Test)" };
    }
    if (!operator) throw new Error("PIN de operador no válido.");
    
    // Llamar a la nueva función en supabase-manager
    return await updatePiecesLocationBatch(pieceIds, containerId, operator.name);
}

window.printSelectedPieces = function() {
    if (state.selectedPieces.size === 0) return;
    
    const selectedIds = Array.from(state.selectedPieces);
    const pieces = state.allPieces.filter(p => selectedIds.includes(p.id));
    
    const printWindow = window.open('', '_blank');
    const html = `
        <html>
        <head>
            <title>Listado de Piezas Seleccionadas</title>
            <style>
                body { font-family: 'Inter', sans-serif; padding: 20px; color: #333; }
                h1 { color: #8b7355; border-bottom: 2px solid #d4af37; padding-bottom: 10px; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border: 1px solid #eee; padding: 10px; text-align: left; vertical-align: middle; }
                th { background: #fafafa; font-size: 0.8rem; text-transform: uppercase; }
                .piece-img { width: 80px; height: 80px; object-fit: cover; border-radius: 4px; border: 1px solid #eee; }
                @media print {
                    .no-print { display: none; }
                }
            </style>
        </head>
        <body>
            <div class="no-print" style="margin-bottom: 20px;">
                <button onclick="window.print()" style="padding: 10px 20px; background: #d4af37; color: white; border: none; border-radius: 5px; cursor: pointer;">Imprimir / Guardar PDF</button>
            </div>
            <h1>ArqueoScan | Listado de Piezas Seleccionadas</h1>
            <table>
                <thead>
                    <tr>
                        <th style="width: 90px;">Imagen</th>
                        <th style="width: 130px;">Nº Inventario</th>
                        <th>Objeto / Denominación</th>
                        <th>Materia</th>
                        <th>Ubicación</th>
                    </tr>
                </thead>
                <tbody>
                    ${pieces.map(p => {
                        const imgNew = p.inventory_number_new ? `img/${p.inventory_number_new}.jpg` : '';
                        const imgOld = p.inventory_number_old ? `img/${p.inventory_number_old}.jpg` : '';
                        const imgSrc = p.image_url || imgNew || imgOld || 'img/placeholder.jpg';
                        const loc = p.containers ? p.containers.name : 'Sin ubicación';
                        
                        return `
                        <tr>
                            <td><img src="${imgSrc}" class="piece-img" onerror="this.src='img/placeholder.jpg'"></td>
                            <td><strong>${p.inventory_number_new || p.id}</strong></td>
                            <td>${p.objeto || p.name}</td>
                            <td>${p.materia || '-'}</td>
                            <td>${loc}</td>
                        </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </body>
        </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
};

// Global exposure
window.loadLocations = loadLocations;
window.showPieceDetail = showPieceDetail;
window.showContainerDetail = showContainerDetail;

// Reemplazar filterLocations para usar el sistema unificado
window.filterLocations = function() {
    applyLocationFilters();
};

// --- MODAL DE UBICACIÓN — LÓGICA DINÁMICA ---

const CONTAINER_TYPES = {
    almacen:   [
        { value: 'caja',       icon: 'package',      label: 'Caja' },
        { value: 'balda',      icon: 'layout-list',  label: 'Balda' },
        { value: 'estanteria', icon: 'server',        label: 'Estantería' },
        { value: 'modulo',     icon: 'grid-2x2',      label: 'Módulo' },
        { value: 'pale',       icon: 'pallet',        label: 'Palé' },
    ],
    exposicion: [
        { value: 'vitrina',    icon: 'picture-in-picture', label: 'Vitrina' },
        { value: 'peana',      icon: 'cylinder',      label: 'Peana' },
        { value: 'pared',      icon: 'image',         label: 'Pared' },
    ]
};

window.onSpaceTypeChange = function(spaceType) {
    renderContainerTypeOptions(spaceType);
    // Mostrar/ocultar campos de jerarquía sólo para almacén
    const hierarchyFields = document.getElementById('almacen-hierarchy-fields');
    if (hierarchyFields) {
        hierarchyFields.style.display = spaceType === 'almacen' ? 'block' : 'none';
    }
};

function renderContainerTypeOptions(spaceType) {
    const grid = document.getElementById('container-type-grid');
    if (!grid) return;

    const options = CONTAINER_TYPES[spaceType] || CONTAINER_TYPES.almacen;
    const currentValue = document.getElementById('new-cont-type')?.value || options[0].value;

    grid.innerHTML = options.map(opt => `
        <label class="cont-type-option ${currentValue === opt.value ? 'selected' : ''}" 
               onclick="window.selectContainerType('${opt.value}', this)">
            <i data-lucide="${opt.icon}"></i>
            <span>${opt.label}</span>
        </label>
    `).join('');

    // Asegurar que el hidden input tenga el primer valor si no coincide
    if (!options.find(o => o.value === currentValue)) {
        const hiddenInput = document.getElementById('new-cont-type');
        if (hiddenInput) hiddenInput.value = options[0].value;
    }

    if (window.lucide) window.lucide.createIcons();
}

window.selectContainerType = function(type, el) {
    document.getElementById('new-cont-type').value = type;
    document.querySelectorAll('.cont-type-option').forEach(o => o.classList.remove('selected'));
    if (el) el.classList.add('selected');
};

// Sobrescribir showAddContainerModal para inicializar el nuevo modal
window.showAddContainerModal = function() {
    document.getElementById('modal-container-title').innerText = 'Nueva Ubicación';
    document.getElementById('btn-submit-container').innerText = 'Crear Ubicación';
    document.getElementById('edit-cont-id').value = '';
    document.getElementById('form-add-container').reset();
    // Radio por defecto: almacén
    const radioAlmacen = document.getElementById('space-type-almacen');
    if (radioAlmacen) radioAlmacen.checked = true;
    // Inicializar opciones de subtipo
    renderContainerTypeOptions('almacen');
    // Mostrar campos de jerarquía
    const hierarchyFields = document.getElementById('almacen-hierarchy-fields');
    if (hierarchyFields) hierarchyFields.style.display = 'block';
    document.getElementById('add-container-modal').style.display = 'flex';
    if (window.lucide) window.lucide.createIcons();
};

// Sobrescribir showEditLocationModal para rellenar el nuevo modal
window.showEditLocationModal = async function(id) {
    try {
        const container = await getContainerById(id);
        if (!container) throw new Error('No se encontró la ubicación');

        const spaceType = container.space_type || 'almacen';

        document.getElementById('edit-cont-id').value = container.id;
        document.getElementById('new-cont-sala').value = container.sala || '';
        document.getElementById('new-cont-name').value = container.name || '';
        if (document.getElementById('new-cont-modulo')) document.getElementById('new-cont-modulo').value = container.modulo || '';
        if (document.getElementById('new-cont-estanteria')) document.getElementById('new-cont-estanteria').value = container.estanteria || '';
        if (document.getElementById('new-cont-balda')) document.getElementById('new-cont-balda').value = container.balda || '';

        // Tipo de espacio
        const radioEl = document.getElementById(`space-type-${spaceType}`);
        if (radioEl) radioEl.checked = true;

        // Tipo de contenedor: pre-seleccionar
        const hiddenType = document.getElementById('new-cont-type');
        if (hiddenType) hiddenType.value = container.container_type || 'caja';

        renderContainerTypeOptions(spaceType);

        // Campos de jerarquía
        const hierarchyFields = document.getElementById('almacen-hierarchy-fields');
        if (hierarchyFields) hierarchyFields.style.display = spaceType === 'almacen' ? 'block' : 'none';

        document.getElementById('modal-container-title').innerText = 'Editar Ubicación';
        document.getElementById('btn-submit-container').innerText = 'Guardar Cambios';
        document.getElementById('add-container-modal').style.display = 'flex';
        if (window.lucide) window.lucide.createIcons();
    } catch (err) {
        console.error(err);
        alert('Error al cargar la ubicación para editar.');
    }
};

// --- DETALLE DE SALA (desde escaneo QR con prefijo S-) ---

/**
 * Muestra el detalle de una sala dado su slug (nombre sin espacios ni caracteres especiales)
 */
async function showRoomDetailBySlug(salaSlug) {
    try {
        // Obtener todos los contenedores y buscar los que pertenecen a esa sala
        const allContainers = await getAllContainers();
        
        // Buscar la sala por slug del nombre
        const matchingContainers = allContainers.filter(c => {
            const slug = (c.sala || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
            return slug === salaSlug;
        });

        if (matchingContainers.length === 0) {
            alert(`No se encontró la sala con QR: S-${salaSlug}`);
            return;
        }

        const salaName = matchingContainers[0].sala;
        const spaceType = matchingContainers[0].space_type || 'almacen';

        // Obtener datos completos de los contenedores con piezas
        const containersWithPieces = await getPiecesBySala(salaName);

        state.currentRoom = { sala: salaName, space_type: spaceType, containers: containersWithPieces };

        renderRoomDetail(state.currentRoom);
        showView('room-detail');
    } catch (err) {
        console.error(err);
        alert('Error al cargar la sala: ' + err.message);
    }
}

function renderRoomDetail(room) {
    const nameEl = document.getElementById('room-detail-name');
    const labelEl = document.getElementById('room-type-label');
    const iconEl = document.getElementById('room-type-icon');
    const statsEl = document.getElementById('room-detail-stats');
    const accordion = document.getElementById('room-containers-accordion');

    if (!nameEl || !accordion) return;

    nameEl.innerText = room.sala;

    const isExpo = room.space_type === 'exposicion';
    labelEl.innerText = isExpo ? 'Sala de Exposición' : 'Almacén';
    labelEl.className = `room-type-label ${isExpo ? 'exposicion' : 'almacen'}`;
    iconEl.innerHTML = `<i data-lucide="${isExpo ? 'landmark' : 'warehouse'}"></i>`;

    const containers = room.containers || [];
    const totalPieces = containers.reduce((sum, c) => sum + (c.pieces || []).length, 0);
    statsEl.innerText = `${containers.length} contenedor${containers.length !== 1 ? 'es' : ''} · ${totalPieces} pieza${totalPieces !== 1 ? 's' : ''}`;

    if (containers.length === 0) {
        accordion.innerHTML = '<div class="glass p-2"><p class="empty-state">Esta sala no tiene contenedores registrados.</p></div>';
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    accordion.innerHTML = containers.map((c, idx) => {
        const pieces = c.pieces || [];
        const typeInfo = getContainerTypeInfo(c.container_type || 'caja');
        const isOpen = idx === 0; // el primero abierto por defecto

        const piecesHtml = pieces.length === 0
            ? '<p class="empty-state" style="padding: 0.75rem 1rem;">Contenedor vacío</p>'
            : pieces.map(p => `
                <div class="room-piece-item" onclick="window.showPieceDetail('${p.id}')">
                    <span class="badge-id">${p.inventory_number_new || p.id}</span>
                    <span class="room-piece-name">${p.objeto || p.name || 'Sin nombre'}</span>
                    <i data-lucide="chevron-right" style="color:var(--primary);flex-shrink:0;"></i>
                </div>
            `).join('');

        return `
            <div class="accordion-item glass mb-1">
                <button class="accordion-header ${isOpen ? 'open' : ''}" onclick="window.toggleAccordion(this)">
                    <div class="accordion-header-left">
                        <i data-lucide="${typeInfo.icon}"></i>
                        <strong>${c.name}</strong>
                        <span class="accordion-type-label">${typeInfo.label}</span>
                    </div>
                    <div class="accordion-header-right">
                        <span class="badge">${pieces.length} pieza${pieces.length !== 1 ? 's' : ''}</span>
                        <i data-lucide="${isOpen ? 'chevron-up' : 'chevron-down'}" class="accordion-arrow"></i>
                    </div>
                </button>
                <div class="accordion-body ${isOpen ? 'open' : ''}">
                    ${piecesHtml}
                </div>
            </div>
        `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
}

window.toggleAccordion = function(headerBtn) {
    const body = headerBtn.nextElementSibling;
    const isOpen = body.classList.contains('open');
    body.classList.toggle('open', !isOpen);
    headerBtn.classList.toggle('open', !isOpen);
    const arrowIcon = headerBtn.querySelector('.accordion-arrow');
    if (arrowIcon) {
        arrowIcon.setAttribute('data-lucide', isOpen ? 'chevron-down' : 'chevron-up');
        if (window.lucide) window.lucide.createIcons();
    }
};

// Modificar showView para incluir la vista room-detail
const originalShowView = window.showView;
window.showView = (viewId, loadData = true) => {
    if (originalShowView) originalShowView(viewId, loadData);
    if (viewId === 'locations') loadLocations();
};
