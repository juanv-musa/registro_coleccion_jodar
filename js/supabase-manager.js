/**
 * GESTOR DE SUPABASE (Versión 5.0 - Blindaje Total)
 */

var dbClient = null;

// Inicialización
window.initSupabase = function() {
    const intentar = () => {
        const lib = window.supabase || (typeof supabase !== 'undefined' ? supabase : null);
        const config = window.SUPABASE_CONFIG;

        if (lib && config && config.url && !config.url.includes("TU_SUPABASE_URL")) {
            try {
                dbClient = lib.createClient(config.url, config.anonKey);
                console.log("✅ Conectado a Supabase.");
                return true;
            } catch (err) { console.error(err); }
        }
        return false;
    };

    if (!intentar()) {
        let r = 0;
        const i = setInterval(() => {
            r++;
            if (intentar() || r > 20) clearInterval(i);
        }, 500);
    }
};

// --- FUNCIONES DE DATOS ---

window.getDashboardStats = async function() {
    if (!dbClient) return { totalPieces: 0, totalContainers: 0, movementsToday: 0 };
    try {
        const { count: p } = await dbClient.from('pieces').select('*', { count: 'exact', head: true });
        const { count: c } = await dbClient.from('containers').select('*', { count: 'exact', head: true });
        return { totalPieces: p || 0, totalContainers: c || 0, movementsToday: 0 };
    } catch (e) { return { totalPieces: 0, totalContainers: 0, movementsToday: 0 }; }
};

window.getRecentMovements = async function() {
    if (!dbClient) return [];
    try {
        const { data } = await dbClient.from('movements').select('*, pieces(name)').order('timestamp', { ascending: false }).limit(5);
        return data || [];
    } catch (e) { return []; }
};

window.getAllPieces = async function() {
    if (!dbClient) return [];
    const { data } = await dbClient.from('pieces').select('*, containers(*)');
    return data || [];
};

window.getAllContainers = async function() {
    if (!dbClient) return [];
    const { data } = await dbClient.from('containers').select('*');
    return data || [];
};

// --- IMPORTACIÓN (La función que daba error de length) ---
window.bulkImportPieces = async function(pieces, containers) {
    console.log("Iniciando importación...", { piezas: pieces?.length, cajas: containers?.length });
    
    if (!dbClient) throw new Error("No hay conexión con la base de datos");

    // 1. Contenedores (Solo si es un array con datos)
    if (Array.isArray(containers) && containers.length > 0) {
        const { error } = await dbClient.from('containers').upsert(containers);
        if (error) throw error;
    }

    // 2. Piezas (Solo si es un array con datos)
    if (Array.isArray(pieces) && pieces.length > 0) {
        const { error } = await dbClient.from('pieces').upsert(pieces);
        if (error) throw error;
    }

    return true;
};

window.verifyOperatorPIN = async function(pin) {
    if (!dbClient) return null;
    const { data, error } = await dbClient.from('operators').select('*').eq('pin', pin).eq('active', true).single();
    return error ? null : data;
};

window.getPieceById = async function(id) {
    if (!dbClient) return null;
    const { data } = await dbClient.from('pieces').select('*, containers(*)').eq('id', id).single();
    return data;
};
