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
    if (!dbClient) return { totalPieces: 0, movementsToday: 0, activeRoom: "-" };
    try {
        const today = new Date();
        today.setHours(0,0,0,0);

        const { count: p } = await dbClient.from('pieces').select('*', { count: 'exact', head: true });
        
        // Contar movimientos de hoy
        const { count: m } = await dbClient.from('movements')
            .select('*', { count: 'exact', head: true })
            .gte('timestamp', today.toISOString());

        // Intentar obtener la sala con más actividad hoy (simplificado)
        const { data: recent } = await dbClient.from('movements')
            .select('destination:containers!destination_container_id(sala)')
            .gte('timestamp', today.toISOString())
            .limit(10);
            
        let activeRoom = "-";
        if (recent && recent.length > 0) {
            const counts = {};
            recent.forEach(r => {
                if (r.destination?.sala) {
                    counts[r.destination.sala] = (counts[r.destination.sala] || 0) + 1;
                }
            });
            activeRoom = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b, "-");
        }

        return { 
            totalPieces: p || 0, 
            movementsToday: m || 0,
            activeRoom: activeRoom 
        };
    } catch (e) { 
        console.error("Dashboard Stats Error:", e);
        return { totalPieces: 0, movementsToday: 0, activeRoom: "-" }; 
    }
};

window.getRecentMovements = async function() {
    if (!dbClient) return [];
    try {
        // Traer datos relacionados: pieza, origen y destino
        const { data } = await dbClient.from('movements')
            .select(`
                *,
                pieces(name, objeto),
                origin:containers!origin_container_id(name, sala),
                destination:containers!destination_container_id(name, sala)
            `)
            .order('timestamp', { ascending: false })
            .limit(10);
            
        return data || [];
    } catch (e) { 
        console.error("Recent Movements Error:", e);
        return []; 
    }
};

window.getAllMovements = async function() {
    if (!dbClient) return [];
    try {
        const { data } = await dbClient.from('movements')
            .select(`
                *,
                pieces(name, objeto, inventory_number_new),
                origin:containers!origin_container_id(name, sala),
                destination:containers!destination_container_id(name, sala)
            `)
            .order('timestamp', { ascending: false });
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

// --- MOVIMIENTOS Y UBICACIONES ---
window.updatePieceLocation = async function(pieceId, containerId, operatorId) {
    if (!dbClient) throw new Error("No hay conexión con la base de datos");
    
    // 1. Obtener ubicación actual para el historial
    const { data: piece } = await dbClient.from('pieces').select('container_id').eq('id', pieceId).single();
    const originId = piece ? piece.container_id : null;

    // 2. Actualizar la pieza
    const { error: pErr } = await dbClient.from('pieces')
        .update({ container_id: containerId, updated_at: new Date() })
        .eq('id', pieceId);
    if (pErr) throw pErr;

    // 3. Registrar el movimiento en el historial
    const { error: mErr } = await dbClient.from('movements').insert({
        piece_id: pieceId,
        origin_container_id: originId,
        destination_container_id: containerId,
        operator_id: operatorId,
        timestamp: new Date()
    });
    if (mErr) throw mErr;

    return true;
};

window.createContainer = async function(containerData) {
    if (!dbClient) throw new Error("No hay conexión con la base de datos");
    const { data, error } = await dbClient.from('containers').upsert(containerData);
    if (error) throw error;
    return data;
};

window.getContainerById = async function(id) {
    if (!dbClient) return null;
    const { data } = await dbClient.from('containers').select('*, pieces(*)').eq('id', id).single();
    return data;
};
