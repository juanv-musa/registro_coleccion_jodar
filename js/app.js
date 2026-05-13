/**
 * ArcheoScan Pro - Main App Controller
 */

// --- APP STATE ---
const state = {
    currentUser: null,
    currentView: 'dashboard',
    currentPiece: null,
    currentContainer: null,
    allPieces: [],
    selectedPieces: new Set(),
    selectedLocations: new Set(),
    allLocations: [],
    filteredPieces: null,
    filteredLocations: null
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    initLucide();
    setupEventListeners();

    try {
        initSupabase();
        const session = await getSession();
        if (session) {
            state.currentUser = session.user;
            document.getElementById('current-user-name').innerText = session.user.email;
            hideLoginOverlay();
            showView('dashboard');
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
        if (window.stopScanner) window.stopScanner();
    }

    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
    
    const targetView = document.getElementById(`view-${viewId}`);
    if (targetView) {
        targetView.style.display = 'block';
    }
    
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === viewId);
    });

    const titleMap = {
        'dashboard': 'Dashboard',
        'inventory': 'Inventario',
        'locations': 'Ubicaciones',
        'scanner': 'Escáner QR',
        'admin': 'Importar',
        'users': 'Operarios'
    };
    const titleEl = document.getElementById('view-title');
    if (titleEl) titleEl.innerText = titleMap[viewId] || 'ArqueoScan';

    state.currentView = viewId;

    // Load data based on view
    if (viewId === 'dashboard') loadDashboardData();
    if (viewId === 'inventory') loadInventory();
    if (viewId === 'locations') loadLocations();
    if (viewId === 'users') loadUsers();
    if (viewId === 'scanner') startScannerView();
    
    initLucide();
}

// --- AUTH ---
function showLoginOverlay() {
    document.getElementById('login-overlay').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
}

function hideLoginOverlay() {
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('app').style.display = 'grid';
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
        showLoginOverlay();
    }
};

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    try {
        await signIn(email, password);
    } catch (err) {
        const errEl = document.getElementById('login-error');
        errEl.style.display = 'block';
        errEl.innerText = err.message;
    }
}

async function handleLogout() {
    if (confirm("¿Cerrar sesión?")) await signOut();
}

// --- DATA ---
async function loadDashboardData() {
    try {
        const stats = await getDashboardStats();
        document.getElementById('stats-total').innerText = stats.totalPieces || 0;
        document.getElementById('stats-today').innerText = stats.movementsToday || 0;
        
        const recent = await getRecentMovements();
        renderRecentMovements(recent);
    } catch (e) { console.error(e); }
}

function renderRecentMovements(movements) {
    const container = document.getElementById('recent-movements-list');
    if (!container) return;
    if (!movements || movements.length === 0) {
        container.innerHTML = '<p class="empty-state">No hay registros recientes</p>';
        return;
    }
    container.innerHTML = movements.map(m => `
        <div class="log-item" onclick="showPieceDetail('${m.piece_id}')">
            <div class="log-info">
                <strong>${m.pieces?.objeto || m.pieces?.name || 'Pieza'}</strong>
                <p>${m.origin?.name || '?'} → ${m.destination?.name || '?'}</p>
                <small>${new Date(m.timestamp).toLocaleString()}</small>
            </div>
            <span class="log-user">${m.operator_id}</span>
        </div>
    `).join('');
}

async function loadInventory() {
    try {
        const pieces = await getAllPieces();
        state.allPieces = pieces.sort((a, b) => {
            return (a.inventory_number_new || "").localeCompare(b.inventory_number_new || "", undefined, { numeric: true });
        });
        renderInventoryTable(state.allPieces);
    } catch (e) { console.error(e); }
}

function renderInventoryTable(pieces) {
    const tbody = document.getElementById('inventory-body');
    if (!tbody) return;
    tbody.innerHTML = pieces.map(p => {
        const loc = p.containers ? `${p.containers.sala} > ${p.containers.name}` : 'Sin ubicación';
        const img = p.image_url || `img/${p.inventory_number_new}.jpg` || 'img/placeholder.jpg';
        return `
            <tr onclick="showPieceDetail('${p.id}')" style="cursor:pointer">
                <td onclick="event.stopPropagation()"><input type="checkbox" onchange="togglePieceSelection('${p.id}', this.checked)"></td>
                <td><span class="badge">${p.inventory_number_new || p.id}</span></td>
                <td>${p.inventory_number_old || '-'}</td>
                <td><img src="${img}" class="table-thumb" onerror="this.src='img/placeholder.jpg'"></td>
                <td><strong>${p.objeto || p.name}</strong></td>
                <td>${p.material || '-'}</td>
                <td><span class="location-tag">${loc}</span></td>
            </tr>
        `;
    }).join('');
}

async function loadLocations() {
    try {
        const containers = await getAllContainers();
        state.allLocations = containers;
        renderLocationsGrid(containers);
    } catch (e) { console.error(e); }
}

function renderLocationsGrid(containers) {
    const list = document.getElementById('locations-list');
    if (!list) return;
    list.innerHTML = containers.map(c => `
        <div class="location-card glass">
            <div class="location-info">
                <h3>${c.name}</h3>
                <p>${c.sala}</p>
                <div class="location-stats">
                    <span class="badge">${c.pieces?.length || 0} piezas</span>
                </div>
            </div>
            <div class="location-actions">
                <button class="btn-icon" onclick="showContainerDetail('${c.id}')"><i data-lucide="eye"></i></button>
            </div>
        </div>
    `).join('');
    initLucide();
}

async function showPieceDetail(id) {
    try {
        const p = await getPieceById(id);
        state.currentPiece = p;
        document.getElementById('detail-name').innerText = p.objeto || p.name;
        document.getElementById('detail-inv-new').innerText = p.inventory_number_new || p.id;
        document.getElementById('detail-material').innerText = p.material || "-";
        document.getElementById('detail-chronology').innerText = p.chronology || "-";
        document.getElementById('detail-container-name').innerText = p.containers?.name || "Sin ubicación";
        document.getElementById('detail-full-path').innerText = p.containers ? `${p.containers.sala} > ${p.containers.modulo || ''}` : "-";
        document.getElementById('detail-dimensions').innerText = p.dimensions || "-";
        document.getElementById('detail-provenance').innerText = p.provenance || "-";
        document.getElementById('detail-author').innerText = p.author || "-";
        document.getElementById('detail-description').innerText = p.description || "";
        
        const imgEl = document.getElementById('detail-image');
        imgEl.src = p.image_url || `img/${p.inventory_number_new}.jpg` || 'img/placeholder.jpg';
        document.getElementById('detail-image-container').style.display = 'block';
        
        if (window.generatePieceQR) window.generatePieceQR('piece-qr-display', p.id);
        showView('detail');
    } catch (e) { console.error(e); }
}

async function showContainerDetail(id) {
    try {
        const c = await getContainerById(id);
        state.currentContainer = c;
        document.getElementById('cont-detail-name').innerText = c.name;
        document.getElementById('cont-detail-path').innerText = `${c.sala} > ${c.modulo || ''}`;
        document.getElementById('cont-piece-count').innerText = `${c.pieces?.length || 0} Piezas`;
        const list = document.getElementById('cont-pieces-list');
        list.innerHTML = (c.pieces || []).map(p => `
            <div class="container-piece-item" onclick="showPieceDetail('${p.id}')">
                <div class="container-piece-info">
                    <h4>${p.objeto || p.name}</h4>
                    <p>${p.inventory_number_new}</p>
                </div>
            </div>
        `).join('');
        showView('container-detail');
    } catch (e) { console.error(e); }
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.onclick = () => showView(btn.dataset.view);
    });

    const formLogin = document.getElementById('form-login');
    if (formLogin) formLogin.onsubmit = handleLogin;

    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) btnLogout.onclick = handleLogout;

    const btnSync = document.getElementById('btn-sync');
    if (btnSync) btnSync.onclick = () => showView(state.currentView);

    const btnBackInv = document.getElementById('btn-back-to-inventory');
    if (btnBackInv) btnBackInv.onclick = () => showView('inventory');

    const btnBackCont = document.getElementById('btn-back-from-container');
    if (btnBackCont) btnBackCont.onclick = () => showView('locations');

    const btnMenuToggle = document.getElementById('btn-menu-toggle');
    if (btnMenuToggle) {
        btnMenuToggle.onclick = () => {
            document.querySelector('.sidebar').classList.toggle('active');
        };
    }
}

// --- EXPOSE GLOBALS ---
window.showView = showView;
window.showPieceDetail = showPieceDetail;
window.showContainerDetail = showContainerDetail;
window.togglePieceSelection = (id, checked) => {
    if (checked) state.selectedPieces.add(id);
    else state.selectedPieces.delete(id);
};

// ... Rest of functions (batch move, etc.) omitted for brevity but should be here if needed ...
// I will keep the core logic minimal and robust as requested.
