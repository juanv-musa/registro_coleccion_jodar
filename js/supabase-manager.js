/**
 * GESTOR DE SUPABASE (Versión 2.0 - Estable)
 */

let supabase = null;

// Exponer funciones globales
window.initSupabase = initSupabase;

// --- INICIALIZACIÓN ---

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
                if (reintentos > 20) alert("Error de conexión persistente.");
            }
        }, 500);
    }
}

// --- OPERARIOS ---
async function verifyOperatorPIN(pin) {
    if (!supabase) return null;
    const { data, error } = await supabase
        .from('operators')
        .select('*')
        .eq('pin', pin)
        .eq('active', true)
        .single();
    if (error) return null;
    return data;
}

// --- DASHBOARD ---
async function getDashboardStats() {
    if (!supabase) return { totalPieces: 0, totalContainers: 0 };
    const { count: p } = await supabase.from('pieces').select('*', { count: 'exact', head: true });
    const { count: c } = await supabase.from('containers').select('*', { count: 'exact', head: true });
    return { totalPieces: p || 0, totalContainers: c || 0 };
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

// --- IMPORTACIÓN MASIVA ---
async function bulkImportPieces(pieces, containers) {
    if (!supabase) throw new Error("No hay conexión con Supabase");

    // 1. Importar Contenedores primero
    if (containers.length > 0) {
        const { error: cErr } = await supabase.from('containers').upsert(containers);
        if (cErr) throw cErr;
    }

    // 2. Importar Piezas
    if (pieces.length > 0) {
        const { error: pErr } = await supabase.from('pieces').upsert(pieces);
        if (pErr) throw pErr;
    }

    return true;
}

// --- EXPOSICIÓN ---
window.verifyOperatorPIN = verifyOperatorPIN;
window.getDashboardStats = getDashboardStats;
window.getAllPieces = getAllPieces;
window.getPieceById = getPieceById;
window.bulkImportPieces = bulkImportPieces;
window.getContainerById = async (id) => {
    const { data } = await supabase.from('containers').select('*').eq('id', id).single();
    return data;
};
window.getAllContainers = async () => {
    const { data } = await supabase.from('containers').select('*');
    return data || [];
};
