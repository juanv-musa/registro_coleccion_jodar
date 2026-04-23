/**
 * GESTOR DE SUPABASE (Versión 4.0 - Sin conflictos de nombres)
 */

// Usamos un nombre que no choque con la librería (que ya usa 'supabase')
var dbClient = null;

// Exponer funciones globales
window.initSupabase = initSupabase;

// --- INICIALIZACIÓN ---

function initSupabase() {
    const intentarConectar = () => {
        // La librería se llama 'supabase' o 'window.supabase'
        const lib = window.supabase || (typeof supabase !== 'undefined' ? supabase : null);
        const config = window.SUPABASE_CONFIG;

        if (lib && config && config.url && !config.url.includes("TU_SUPABASE_URL")) {
            try {
                const { createClient } = lib;
                // Guardamos la conexión en dbClient para no chocar
                dbClient = createClient(config.url, config.anonKey);
                console.log("✅ Supabase conectado (dbClient listo).");
                return true;
            } catch (err) {
                console.error("❌ Error de cliente:", err);
            }
        }
        return false;
    };

    if (!intentarConectar()) {
        let reintentos = 0;
        const interval = setInterval(() => {
            reintentos++;
            if (intentarConectar() || reintentos > 20) {
                clearInterval(interval);
            }
        }, 500);
    }
}

// --- OPERARIOS ---
async function verifyOperatorPIN(pin) {
    if (!dbClient) return null;
    const { data, error } = await dbClient.from('operators').select('*').eq('pin', pin).eq('active', true).single();
    return error ? null : data;
}

// --- DASHBOARD ---
async function getDashboardStats() {
    if (!dbClient) return { totalPieces: 0, totalContainers: 0, movementsToday: 0 };
    try {
        const { count: p } = await dbClient.from('pieces').select('*', { count: 'exact', head: true });
        const { count: c } = await dbClient.from('containers').select('*', { count: 'exact', head: true });
        return { totalPieces: p || 0, totalContainers: c || 0, movementsToday: 0 };
    } catch (e) { return { totalPieces: 0, totalContainers: 0, movementsToday: 0 }; }
}

async function getRecentMovements() {
    if (!dbClient) return [];
    try {
        const { data } = await dbClient.from('movements').select('*, pieces(name)').order('timestamp', { ascending: false }).limit(5);
        return data || [];
    } catch (e) { return []; }
}

// --- PIEZAS ---
async function getAllPieces() {
    if (!dbClient) return [];
    const { data } = await dbClient.from('pieces').select('*, containers(*)');
    return data || [];
}

async function getPieceById(id) {
    if (!dbClient) return null;
    const { data } = await dbClient.from('pieces').select('*, containers(*)').eq('id', id).single();
    return data;
}

// --- CONTENEDORES ---
async function getAllContainers() {
    if (!dbClient) return [];
    const { data } = await dbClient.from('containers').select('*');
    return data || [];
}

// --- IMPORTACIÓN ---
async function bulkImportPieces(pieces, containers) {
    if (!dbClient) throw new Error("No hay conexión con la base de datos");
    if (containers.length > 0) {
        const { error: cErr } = await dbClient.from('containers').upsert(containers);
        if (cErr) throw cErr;
    }
    if (pieces.length > 0) {
        const { error: pErr } = await dbClient.from('pieces').upsert(pieces);
        if (pErr) throw pErr;
    }
    return true;
}

// --- EXPOSICIÓN GLOBAL ---
window.verifyOperatorPIN = verifyOperatorPIN;
window.getDashboardStats = getDashboardStats;
window.getRecentMovements = getRecentMovements;
window.getAllPieces = getAllPieces;
window.getPieceById = getPieceById;
window.getAllContainers = getAllContainers;
window.bulkImportPieces = bulkImportPieces;
window.getContainerById = async (id) => {
    if (!dbClient) return null;
    const { data } = await dbClient.from('containers').select('*').eq('id', id).single();
    return data;
};
