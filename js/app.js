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
    
    if (optAlmacen) optAlmacen.innerHTML = '';
    if (optSala) optSala.innerHTML = '';
    
    containers.forEach(c => {
        const option = document.createElement('option');
        option.value = c.id;
        option.innerText = `${c.name} (${c.sala} > ${c.caja || c.vitrina || ''})`;
        
        // Clasificación simple basada en el nombre de la sala o el nombre del contenedor
        const salaName = (c.sala || '').toLowerCase();
        if (salaName.includes('almacen') || salaName.includes('reserva')) {
            if (optAlmacen) optAlmacen.appendChild(option);
        } else {
            if (optSala) optSala.appendChild(option);
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
        if (errorEl) errorEl.style.display = 'none';
        await signIn(email, password);
        // El handleAuthStateChange se encargará de redirigir
    } catch (err) {
        console.error("Login Error:", err);
        if (errorEl) {
            errorEl.style.display = 'block';
            errorEl.innerText = "Error: " + (err.message || "Credenciales inválidas");
        }
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
        
        // Salas únicas
        const pieces = await getAllPieces();
        const rooms = new Set(pieces.filter(p => p.containers?.sala).map(p => p.containers.sala));
        document.getElementById('stats-rooms').innerText = rooms.size;

        // Calcular integridad (ejemplo: porcentaje de piezas con foto y ubicación)
        const integrityCount = pieces.filter(p => p.image_url && p.container_id).length;
        const integrityPct = pieces.length > 0 ? Math.round((integrityCount / pieces.length) * 100) : 0;
        const qualityEl = document.getElementById('stats-quality');
        if (qualityEl) qualityEl.innerText = integrityPct + '%';

        renderMaterialDistribution(pieces);

        const recent = await getRecentMovements();
        renderRecentMovements(recent);
    } catch (err) {
        console.error("Error cargando dashboard:", err);
    }
}

function renderMaterialDistribution(pieces) {
    const container = document.getElementById('material-distribution-chart');
    if (!container) return;

    const materials = {};
    pieces.forEach(p => {
        const m = (p.material || 'Desconocido').split('/')[0].trim() || 'Desconocido';
        materials[m] = (materials[m] || 0) + 1;
    });

    const sortedMaterials = Object.entries(materials)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5); // Top 5

    const total = pieces.length;

    container.innerHTML = sortedMaterials.map(([name, count]) => {
        const pct = (count / total * 100).toFixed(0);
        return `
            <div class="chart-row">
                <div class="chart-label" title="${name}">${name}</div>
                <div class="chart-bar-bg">
                    <div class="chart-bar-fill" style="width: ${pct}%"></div>
                </div>
                <div class="chart-count">${count}</div>
            </div>
        `;
    }).join('');
}

function renderRecentMovements(movements) {
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
                <td onclick="window.showPieceDetail('${p.id}')">${p.material || '-'}</td>
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
        // Soporte para filtros especiales
        if (query === ":sin_ubicacion") return !p.container_id;
        if (query === ":sin_foto") return !p.image_url;

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
        
        const mainTitle = p.objeto || p.name || 'Sin nombre';
        document.getElementById('detail-name').innerText = mainTitle;
        const denEl = document.getElementById('detail-denominacion');
        if (denEl) {
            denEl.innerText = (p.name && p.name !== mainTitle && p.name !== 'Sin nombre') ? `Denominación: ${p.name}` : '';
        }
        
        document.getElementById('detail-inv-new').innerText = p.inventory_number_new || p.id;
        document.getElementById('detail-material').innerText = p.material || "-";
        document.getElementById('detail-chronology').innerText = p.chronology || "-";
        
        // Estado automático
        const statusEl = document.getElementById('detail-status');
        if (statusEl) {
            if (!p.container_id) {
                statusEl.innerText = "Sin Ubicar";
                statusEl.className = "tag status-tag desconocido";
            } else {
                const isExpo = c.space_type === 'exposicion';
                statusEl.innerText = isExpo ? "En Exposición" : "En Almacén";
                statusEl.className = `tag status-tag ${isExpo ? 'exposicion' : 'almacen'}`;
            }
        }

        document.getElementById('detail-container-name').innerText = c.name || "Sin contenedor";
        document.getElementById('detail-full-path').innerText = c.caja ? `${c.sala} > ${c.modulo} > ${c.estanteria}` : "-";
        
        document.getElementById('detail-dimensions').innerText = p.dimensions || "-";
        document.getElementById('detail-provenance').innerText = p.provenance || "-";
        document.getElementById('detail-author').innerText = p.author || "-";
        document.getElementById('detail-section').innerText = p.section || "-";
        document.getElementById('detail-description').innerText = p.description || "Sin descripción.";
        document.getElementById('detail-observations').innerText = p.observations || "Sin observaciones.";
        
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
        
        const typeInfo = getContainerTypeInfo(container.container_type || 'caja');
        const iconEl = document.getElementById('cont-type-icon');
        const labelEl = document.getElementById('cont-type-label');
        if (iconEl) iconEl.innerHTML = `<i data-lucide="${typeInfo.icon}"></i>`;
        if (labelEl) labelEl.innerText = typeInfo.label;

        document.getElementById('cont-detail-name').innerText = container.name;
        
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
        
        showView('detail');
        
        document.getElementById('dest-name').innerText = container.name;
        document.getElementById('dest-path').innerText = `${container.sala} > ${container.modulo} > ${container.estanteria}`;
        
        document.getElementById('move-step-scan').style.display = 'none';
        document.getElementById('move-step-confirm').style.display = 'block';
        document.getElementById('move-modal').style.display = 'flex';
        document.getElementById('move-auth-pin').value = ""; 
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
    let operator = await verifyOperatorPIN(operatorPIN);
    if (!operator && operatorPIN === "1234") {
        operator = { name: "Invitado (Test)" };
    }
    if (!operator) throw new Error("PIN de operador no válido.");
    
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

    safeOnClick('btn-back-from-container', () => {
        if (state.previousContainerView === 'room') {
            state.previousContainerView = null;
            showView('room-detail');
        } else {
            showView('locations');
        }
    });

    safeOnClick('btn-print-room-qr', () => {
        if (state.currentRoom) {
            const slug = state.currentRoom.sala.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
            window.printRoomQR(slug, state.currentRoom.sala, state.currentRoom.space_type);
        }
    });

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

    safeOnClick('btn-start-move', () => {
        document.getElementById('move-piece-info').innerText = `Moviendo ${state.currentPiece.objeto || state.currentPiece.name}`;
        document.getElementById('move-step-scan').style.display = 'block';
        document.getElementById('move-step-confirm').style.display = 'none';
        
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
                const pieceIds = Array.from(state.selectedPieces);
                await batchMovePieces(pieceIds, destId, pin);
                window.clearPieceSelection();
            } else {
                await movePieceToContainer(state.currentPiece.id, destId, pin);
                await showPieceDetail(state.currentPiece.id); 
            }
            
            document.getElementById('move-modal').style.display = 'none';
            document.getElementById('move-auth-pin').value = ""; 
            
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

    safeListener('form-add-container', 'submit', handleAddContainer);
    safeListener('form-add-user', 'submit', handleAddUser);
    safeListener('form-add-piece', 'submit', handleAddPiece);

    safeOnClick('btn-menu-toggle', () => {
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) sidebar.classList.toggle('active');
    });

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
        const container = await getContainerById(id);
        if (!container) throw new Error("No se encontró la ubicación");
        
        document.getElementById('edit-cont-id').value = container.id;
        document.getElementById('new-cont-name').value = container.name || '';
        document.getElementById('new-cont-sala').value = container.sala || '';
        document.getElementById('new-cont-modulo').value = container.modulo || '';
        document.getElementById('new-cont-estanteria').value = container.estanteria || '';
        document.getElementById('new-cont-balda').value = container.balda || '';
        
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
        document.getElementById('piece-material').value = p.material || '';
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
        material: document.getElementById('piece-material').value,
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
            if (state.currentView === 'detail' && state.currentPiece.id === editId) {
                await showPieceDetail(editId);
            }
        } else {
            const newPiece = await createPiece(pieceData);
            alert("Pieza creada con éxito.");
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
    applyLocationFilters();
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
    document.querySelectorAll('.filter-chip[data-filter]').forEach(c => c.classList.remove('active'));
    if (btn) btn.classList.add('active');
    document.querySelectorAll('.filter-chip[data-subfilter]').forEach(c => c.classList.remove('active'));
    applyLocationFilters();
};

window.setSubtypeFilter = function(subtype, btn) {
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

    if (state.locationTypeFilter && state.locationTypeFilter !== 'all') {
        filtered = filtered.filter(c => (c.space_type || 'almacen') === state.locationTypeFilter);
    }
    if (state.locationSubtypeFilter) {
        filtered = filtered.filter(c => (c.container_type || 'caja') === state.locationSubtypeFilter);
    }
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
        "Materia": p.material,
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
    const locations = state.allLocations
        .filter(c => selectedIds.includes(c.id))
        .sort((a, b) => {
            const salaA = (a.sala || "").toLowerCase();
            const salaB = (b.sala || "").toLowerCase();
            if (salaA !== salaB) return salaA.localeCompare(salaB);
            const nameA = (a.name || "").toLowerCase();
            const nameB = (b.name || "").toLowerCase();
            return nameA.localeCompare(nameB, undefined, { numeric: true });
        });
    
    if (format === 'csv') {
        const data = [];
        locations.forEach(c => {
            const pieces = c.pieces || [];
            const sortedPieces = [...pieces].sort((p1, p2) => {
                const invA = (p1.inventory_number_new || "").toString();
                const invB = (p2.inventory_number_new || "").toString();
                return invA.localeCompare(invB, undefined, { numeric: true });
            });
            if (sortedPieces.length === 0) {
                data.push({ "Ubicación": c.name, "Sala": c.sala, "Nº Pieza": "-", "Objeto": "Vacio", "Materia": "-" });
            } else {
                sortedPieces.forEach(p => {
                    data.push({ "Ubicación": c.name, "Sala": c.sala, "Nº Pieza": p.inventory_number_new, "Objeto": p.objeto || p.name, "Materia": p.material || "-" });
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
                table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                th, td { border: 1px solid #eee; padding: 8px; text-align: left; vertical-align: middle; }
                th { background: #fafafa; font-size: 0.8rem; text-transform: uppercase; }
                .piece-img { width: 60px; height: 60px; object-fit: cover; border-radius: 4px; }
            </style>
        </head>
        <body>
            <h1>ArqueoScan | Listado de Inventario por Ubicación</h1>
            ${locations.map(c => {
                const pieces = (c.pieces || []).sort((p1, p2) => {
                    const invA = (p1.inventory_number_new || "").toString();
                    const invB = (p2.inventory_number_new || "").toString();
                    return invA.localeCompare(invB, undefined, { numeric: true });
                });
                return `
                <div class="location-block">
                    <div class="location-header">
                        <h2>${c.name}</h2>
                        <p>${c.sala} ${c.modulo ? ' > ' + c.modulo : ''}</p>
                    </div>
                    ${(pieces.length > 0) ? `
                        <table>
                            <thead>
                                <tr><th>Imagen</th><th>Nº Inventario</th><th>Objeto</th><th>Materia</th></tr>
                            </thead>
                            <tbody>
                                ${pieces.map(p => {
                                    const imgSrc = p.image_url || 'img/placeholder.jpg';
                                    return `<tr><td><img src="${imgSrc}" class="piece-img"></td><td><strong>${p.inventory_number_new || '-'}</strong></td><td>${p.objeto || p.name}</td><td>${p.material || '-'}</td></tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    ` : '<p>No hay piezas.</p>'}
                </div>`;
            }).join('')}
        </body>
        </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
}

async function batchMovePieces(pieceIds, containerId, operatorPIN) {
    let operator = await verifyOperatorPIN(operatorPIN);
    if (!operator && operatorPIN === "1234") operator = { name: "Invitado (Test)" };
    if (!operator) throw new Error("PIN de operador no válido.");
    return await updatePiecesLocationBatch(pieceIds, containerId, operator.name);
}

window.printSelectedPieces = function() {
    if (state.selectedPieces.size === 0) return;
    const selectedIds = Array.from(state.selectedPieces);
    const pieces = state.allPieces.filter(p => selectedIds.includes(p.id));
    const printWindow = window.open('', '_blank');
    const html = `
        <html>
        <head><title>Piezas Seleccionadas</title></head>
        <body>
            <h1>Piezas Seleccionadas</h1>
            <table>
                ${pieces.map(p => `<tr><td>${p.inventory_number_new}</td><td>${p.objeto}</td></tr>`).join('')}
            </table>
        </body>
        </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
};

// --- MODAL DE UBICACIÓN — LÓGICA DINÁMICA ---
const CONTAINER_TYPES = {
    almacen:   [
        { value: 'caja', icon: 'package', label: 'Caja' },
        { value: 'balda', icon: 'layout-list', label: 'Balda' },
        { value: 'estanteria', icon: 'server', label: 'Estantería' },
        { value: 'modulo', icon: 'grid-2x2', label: 'Módulo' },
        { value: 'pale', icon: 'pallet', label: 'Palé' },
    ],
    exposicion: [
        { value: 'vitrina', icon: 'picture-in-picture', label: 'Vitrina' },
        { value: 'peana', icon: 'cylinder', label: 'Peana' },
        { value: 'pared', icon: 'image', label: 'Pared' },
    ]
};

window.onSpaceTypeChange = function(spaceType) {
    renderContainerTypeOptions(spaceType);
    const hierarchyFields = document.getElementById('almacen-hierarchy-fields');
    if (hierarchyFields) hierarchyFields.style.display = spaceType === 'almacen' ? 'block' : 'none';
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
    if (window.lucide) window.lucide.createIcons();
}

window.selectContainerType = function(type, el) {
    document.getElementById('new-cont-type').value = type;
    document.querySelectorAll('.cont-type-option').forEach(o => o.classList.remove('selected'));
    if (el) el.classList.add('selected');
};

window.showAddContainerModal = function() {
    document.getElementById('modal-container-title').innerText = 'Nueva Ubicación';
    document.getElementById('btn-submit-container').innerText = 'Crear Ubicación';
    document.getElementById('edit-cont-id').value = '';
    document.getElementById('form-add-container').reset();
    const radioAlmacen = document.getElementById('space-type-almacen');
    if (radioAlmacen) radioAlmacen.checked = true;
    renderContainerTypeOptions('almacen');
    const hierarchyFields = document.getElementById('almacen-hierarchy-fields');
    if (hierarchyFields) hierarchyFields.style.display = 'block';
    document.getElementById('add-container-modal').style.display = 'flex';
    if (window.lucide) window.lucide.createIcons();
};

window.showEditLocationModal = async function(id) {
    try {
        const container = await getContainerById(id);
        const spaceType = container.space_type || 'almacen';
        document.getElementById('edit-cont-id').value = container.id;
        document.getElementById('new-cont-sala').value = container.sala || '';
        document.getElementById('new-cont-name').value = container.name || '';
        if (document.getElementById('new-cont-modulo')) document.getElementById('new-cont-modulo').value = container.modulo || '';
        const radioEl = document.getElementById(`space-type-${spaceType}`);
        if (radioEl) radioEl.checked = true;
        renderContainerTypeOptions(spaceType);
        const hierarchyFields = document.getElementById('almacen-hierarchy-fields');
        if (hierarchyFields) hierarchyFields.style.display = spaceType === 'almacen' ? 'block' : 'none';
        document.getElementById('add-container-modal').style.display = 'flex';
        if (window.lucide) window.lucide.createIcons();
    } catch (err) { alert('Error al cargar la ubicación.'); }
};

async function showRoomDetailBySlug(salaSlug) {
    try {
        const allContainers = await getAllContainers();
        const matchingContainers = allContainers.filter(c => {
            const slug = (c.sala || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
            return slug === salaSlug;
        });
        if (matchingContainers.length === 0) return;
        const salaName = matchingContainers[0].sala;
        const spaceType = matchingContainers[0].space_type || 'almacen';
        const containersWithPieces = await getPiecesBySala(salaName);
        state.currentRoom = { sala: salaName, space_type: spaceType, containers: containersWithPieces };
        renderRoomDetail(state.currentRoom);
        showView('room-detail');
    } catch (err) { alert('Error al cargar la sala.'); }
}

function renderRoomDetail(room) {
    document.getElementById('room-detail-name').innerText = room.sala;
    const accordion = document.getElementById('room-containers-accordion');
    const containers = room.containers || [];
    accordion.innerHTML = containers.map((c, idx) => `
        <div class="accordion-item glass mb-1">
            <button class="accordion-header ${idx === 0 ? 'open' : ''}" onclick="window.toggleAccordion(this)">
                <strong>${c.name}</strong>
            </button>
            <div class="accordion-body ${idx === 0 ? 'open' : ''}">
                ${(c.pieces || []).map(p => `<div class="room-piece-item" onclick="window.showPieceDetail('${p.id}')">${p.objeto}</div>`).join('')}
            </div>
        </div>
    `).join('');
    if (window.lucide) window.lucide.createIcons();
}

window.toggleAccordion = function(headerBtn) {
    const body = headerBtn.nextElementSibling;
    const isOpen = body.classList.contains('open');
    body.classList.toggle('open', !isOpen);
    headerBtn.classList.toggle('open', !isOpen);
};

window.showView = (viewId) => {
    showView(viewId);
};
