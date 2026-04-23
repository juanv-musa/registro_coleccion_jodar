/**
 * GESTOR DE SUPABASE (Versión 3.0 - Full Compatibility)
 */

let supabase = null;

// Inicialización de la conexión
function initSupabase() {
    const intentarConectar = () => {
        const lib = window.supabase || (typeof supabase !== 'undefined' ? supabase : null);
        const config = window.SUPABASE_CONFIG;

        if (lib && config && config.url && !config.url.includes("TU_SUPABASE_URL")) {
            try {
                const { createClient } = lib;
                supabase = createClient(config.url, config.anonKey);
                console.log("✅ Supabase conectado.");
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
    if (!supabase) return null;
    const { data, error } = await supabase.from('operators').select('*').eq('pin', pin).eq('active', true).single();
    return error ? null : data;
}

// --- DASHBOARD ---
async function getDashboardStats() {
    if (!supabase) return { totalPieces: 0, totalContainers: 0, movementsToday: 0 };
    try {
        const { count: p } = await supabase.from('pieces').select('*', { count: 'exact', head: true });
        const { count: c } = await supabase.from('containers').select('*', { count: 'exact', head: true });
        return { totalPieces: p || 0, totalContainers: c || 0, movementsToday: 0 };
    } catch (e) { return { totalPieces: 0, totalContainers: 0, movementsToday: 0 }; }
}

async function getRecentMovements() {
    if (!supabase) return [];
    // Simplemente devolvemos vacío si no hay tabla de movimientos todavía
    try {
        const { data } = await supabase.from('movements').select('*, pieces(name)').order('timestamp', { ascending: false }).limit(5);
        return data || [];
    } catch (e) { return []; }
}

// --- PIEZAS ---
async function getAllPieces() {
    if (!supabase) return [];
    const { data } = await supabase.from('pieces').select('*, containers(*)');
    return data || [];
}

async function getPieceById(id) {
    if (!supabase) return null;
    const { data } = await supabase.from('pieces').select('*, containers(*)').eq('id', id).single();
    return data;
}

// --- CONTENEDORES ---
async function getAllContainers() {
    if (!supabase) return [];
    const { data } = await supabase.from('containers').select('*');
    return data || [];
}

// --- IMPORTACIÓN ---
async function bulkImportPieces(pieces, containers) {
    if (!supabase) throw new Error("No hay conexión con Supabase");
    if (containers.length > 0) {
        const { error: cErr } = await supabase.from('containers').upsert(containers);
        if (cErr) throw cErr;
    }
    if (pieces.length > 0) {
        const { error: pErr } = await supabase.from('pieces').upsert(pieces);
        if (pErr) throw pErr;
    }
    return true;
}

// --- EXPOSICIÓN GLOBAL ---
window.initSupabase = initSupabase;
window.verifyOperatorPIN = verifyOperatorPIN;
window.getDashboardStats = getDashboardStats;
window.getRecentMovements = getRecentMovements;
window.getAllPieces = getAllPieces;
window.getPieceById = getPieceById;
window.getAllContainers = getAllContainers;
window.bulkImportPieces = bulkImportPieces;
window.getContainerById = async (id) => {
    if (!supabase) return null;
    const { data } = await supabase.from('containers').select('*').eq('id', id).single();
    return data;
};
