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
                
                // Escuchar cambios de autenticación
                dbClient.auth.onAuthStateChange((event, session) => {
                    console.log("Auth event:", event);
                    if (window.handleAuthStateChange) window.handleAuthStateChange(event, session);
                });

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

// --- AUTHENTICATION ---

window.signIn = async function(email, password) {
    if (!dbClient) throw new Error("No hay conexión con Supabase");
    const { data, error } = await dbClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
};

window.signOut = async function() {
    if (!dbClient) return;
    const { error } = await dbClient.auth.signOut();
    if (error) console.error("Error al cerrar sesión:", error);
};

window.getSession = async function() {
    if (!dbClient) return null;
    const { data: { session } } = await dbClient.auth.getSession();
    return session;
};

// --- FUNCIONES DE DATOS ---

window.getDashboardStats = async function() {
    if (!dbClient) return { totalPieces: 0, movementsToday: 0 };
    try {
        const today = new Date();
        today.setHours(0,0,0,0);

        const { count: p } = await dbClient.from('pieces').select('*', { count: 'exact', head: true });
        
        // Contar movimientos de hoy
        const { count: m } = await dbClient.from('movements')
            .select('*', { count: 'exact', head: true })
            .gte('timestamp', today.toISOString());

        return { 
            totalPieces: p || 0, 
            movementsToday: m || 0
        };
    } catch (e) { 
        console.error("Dashboard Stats Error:", e);
        return { totalPieces: 0, movementsToday: 0 }; 
    }
};

window.getRecentMovements = async function() {
    if (!dbClient) return [];
    try {
        const { data, error } = await dbClient.from('movements')
            .select(`
                *,
                pieces(*),
                origin:containers!origin_container_id(name, sala),
                destination:containers!destination_container_id(name, sala)
            `)
            .order('timestamp', { ascending: false })
            .limit(10);
            
        if (error) {
            console.error("Supabase Error en movimientos:", error);
            return [];
        }
        return data || [];
    } catch (e) { 
        console.error("Recent Movements Exception:", e);
        return []; 
    }
};

window.getAllMovements = async function() {
    if (!dbClient) return [];
    try {
        const { data } = await dbClient.from('movements')
            .select(`
                *,
                pieces(*),
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
    const { data } = await dbClient.from('containers').select('*, pieces(id, objeto, name, inventory_number_new, image_url, material)').order('sala').order('name');
    return data || [];
};

// --- IMPORTACIÓN ---
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
    
    // Verificamos si hay sesión activa antes de consultar la tabla de operadores
    const session = await window.getSession();
    if (!session) {
        console.warn("Intento de verificación de PIN sin sesión activa.");
        return null;
    }

    const { data, error } = await dbClient
        .from('operators')
        .select('*')
        .eq('pin', pin)
        .eq('active', true)
        .maybeSingle();
        
    if (error) {
        console.error("Error en verifyOperatorPIN:", error);
        return null;
    }
    return data;
};

window.getPieceById = async function(id) {
    if (!dbClient) return null;
    const { data } = await dbClient.from('pieces').select('*, containers(*)').eq('id', id).single();
    return data;
};

window.createPiece = async function(pieceData) {
    if (!dbClient) throw new Error("No hay conexión con la base de datos");
    // Si no viene ID, generamos uno temporal estilo P-TIMESTAMP
    if (!pieceData.id) pieceData.id = `P-${Date.now()}`;
    const { data, error } = await dbClient.from('pieces').insert([pieceData]).select();
    if (error) throw error;
    return data[0];
};

window.updatePiece = async function(id, updates) {
    if (!dbClient) throw new Error("No hay conexión con la base de datos");
    const { data, error } = await dbClient.from('pieces').update(updates).eq('id', id).select();
    if (error) throw error;
    return data[0];
};

window.deletePiece = async function(id) {
    if (!dbClient) throw new Error("No hay conexión con la base de datos");
    const { error } = await dbClient.from('pieces').delete().eq('id', id);
    if (error) throw error;
    return true;
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

window.updatePiecesLocationBatch = async function(pieceIds, containerId, operatorId) {
    if (!dbClient) throw new Error("No hay conexión con la base de datos");
    
    // 1. Obtener ubicaciones actuales para el historial
    const { data: currentPieces } = await dbClient.from('pieces').select('id, container_id').in('id', pieceIds);
    
    // 2. Actualizar las piezas en lote
    const { error: pErr } = await dbClient.from('pieces')
        .update({ container_id: containerId, updated_at: new Date() })
        .in('id', pieceIds);
    if (pErr) throw pErr;

    // 3. Registrar los movimientos en el historial
    const movements = currentPieces.map(p => ({
        piece_id: p.id,
        origin_container_id: p.container_id,
        destination_container_id: containerId,
        operator_id: operatorId,
        timestamp: new Date()
    }));
    
    const { error: mErr } = await dbClient.from('movements').insert(movements);
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

window.deleteContainer = async function(id) {
    if (!dbClient) throw new Error("No hay conexión con la base de datos");
    const { error } = await dbClient.from('containers').delete().eq('id', id);
    if (error) throw error;
    return true;
};

// --- USUARIOS / OPERADORES ---
window.getAllOperators = async function() {
    if (!dbClient) return [];
    const { data } = await dbClient.from('operators').select('*').order('name');
    return data || [];
};

window.createOperator = async function(operatorData) {
    if (!dbClient) throw new Error("No hay conexión con la base de datos");
    const { data, error } = await dbClient.from('operators').insert([operatorData]);
    if (error) throw error;
    return data;
};

window.updateOperator = async function(id, updates) {
    if (!dbClient) throw new Error("No hay conexión");
    const { error } = await dbClient.from('operators').update(updates).eq('id', id);
    if (error) throw error;
    return true;
};

window.deleteOperator = async function(id) {
    if (!dbClient) throw new Error("No hay conexión");
    const { error } = await dbClient.from('operators').delete().eq('id', id);
    if (error) throw error;
    return true;
};

// --- SALAS / ROOMS ---

/**
 * Obtiene todas las piezas que están en contenedores de una sala específica.
 * Agrupa los contenedores de esa sala con sus piezas.
 */
window.getPiecesBySala = async function(sala) {
    if (!dbClient) return [];
    try {
        const { data, error } = await dbClient
            .from('containers')
            .select('*, pieces(id, objeto, name, inventory_number_new, image_url, material)')
            .eq('sala', sala)
            .order('name');
        if (error) throw error;
        return data || [];
    } catch(e) {
        console.error('getPiecesBySala error:', e);
        return [];
    }
};

/**
 * Obtiene los grupos de salas únicas con sus conteos de contenedores y piezas.
 * Devuelve un array de { sala, space_type, containerCount, pieceCount, containers }
 */
window.getAllRooms = async function() {
    if (!dbClient) return [];
    try {
        const { data, error } = await dbClient
            .from('containers')
            .select('id, name, sala, space_type, container_type, pieces(id)')
            .order('sala');
        if (error) throw error;

        // Agrupar por sala
        const roomMap = {};
        (data || []).forEach(c => {
            if (!roomMap[c.sala]) {
                roomMap[c.sala] = {
                    sala: c.sala,
                    space_type: c.space_type || 'almacen',
                    containerCount: 0,
                    pieceCount: 0,
                    containers: []
                };
            }
            roomMap[c.sala].containerCount++;
            roomMap[c.sala].pieceCount += (c.pieces || []).length;
            roomMap[c.sala].containers.push(c);
        });

        return Object.values(roomMap);
    } catch(e) {
        console.error('getAllRooms error:', e);
        return [];
    }
};
