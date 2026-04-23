var supabase = null;

// Declaración inmediata de funciones globales
window.initSupabase = initSupabase;
window.bulkImportPieces = bulkImportPieces;
window.getAllPieces = getAllPieces;
window.getPieceById = getPieceById;
window.searchPieces = searchPieces;
window.movePieceToContainer = movePieceToContainer;
window.getDashboardStats = getDashboardStats;
window.getRecentMovements = getRecentMovements;
window.verifyOperatorPIN = verifyOperatorPIN;
window.getContainerById = getContainerById;
window.getAllContainers = getAllContainers;

// Inicialización segura
function initSupabase() {
    if (!window.supabase) {
        console.error("La librería de Supabase no se ha cargado. Verifica tu conexión a internet.");
        return null;
    }
    
    const { createClient } = window.supabase;

    if (SUPABASE_CONFIG.url === "TU_SUPABASE_URL") {
        console.warn("Supabase no configurado. Introduce tus credenciales en js/supabase-config.js");
        return null;
    }
    supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
    return supabase;
}

// --- AUTENTICACIÓN / OPERARIOS ---

async function verifyOperatorPIN(pin) {
    const { data, error } = await supabase
        .from('operators')
        .select('name, pin')
        .eq('pin', pin)
        .eq('active', true)
        .single();
        
    if (error) return null;
    return data;
}

async function getContainerById(id) {
    const { data: container, error: containerError } = await supabase
        .from('containers')
        .select(`
            *,
            pieces (
                id,
                name,
                inventory_number_new
            )
        `)
        .eq('id', id)
        .single();
        
    if (containerError) throw containerError;
    return container;
}

async function getAllContainers() {
    const { data, error } = await supabase
        .from('containers')
        .select('*')
        .order('sala', { ascending: true });
    if (error) throw error;
    return data;
}

async function createContainer(containerData) {
    const { data, error } = await supabase
        .from('containers')
        .insert([containerData]);
    if (error) throw error;
    return data;
}

// --- OPERACIONES DE PIEZAS ---

async function getAllPieces() {
    const { data, error } = await supabase
        .from('pieces')
        .select(`
            *,
            containers (
                sala, modulo, estanteria, balda, caja
            )
        `)
        .order('inventory_number_new', { ascending: true });
        
    if (error) throw error;
    return data;
}

async function getPieceById(id) {
    const { data, error } = await supabase
        .from('pieces')
        .select(`
            *,
            containers (*),
            movements (
                *,
                destination:destination_container_id (*),
                origin:origin_container_id (*)
            )
        `)
        .eq('id', id)
        .single();
        
    if (error) throw error;
    return data;
}

async function searchPieces(query) {
    const { data, error } = await supabase
        .from('pieces')
        .select('*')
        .or(`name.ilike.%${query}%,inventory_number_new.ilike.%${query}%,sala.ilike.%${query}%`)
        .limit(20);
        
    if (error) throw error;
    return data;
}

// --- OPERACIONES DE MOVIMIENTOS ---

async function movePieceToContainer(pieceId, containerId, operatorPin) {
    // 1. Obtener la ubicación actual
    const { data: piece, error: pieceError } = await supabase
        .from('pieces')
        .select('container_id')
        .eq('id', pieceId)
        .single();
        
    if (pieceError) throw pieceError;

    // 2. Actualizar el contenedor de la pieza
    const { error: updateError } = await supabase
        .from('pieces')
        .update({
            container_id: containerId,
            updated_at: new Date()
        })
        .eq('id', pieceId);
        
    if (updateError) throw updateError;

    // 3. Registrar el movimiento
    const { error: logError } = await supabase
        .from('movements')
        .insert([{
            piece_id: pieceId,
            origin_container_id: piece.container_id,
            destination_container_id: containerId,
            operator_id: operatorPin,
            timestamp: new Date()
        }]);

    if (logError) throw logError;
    return true;
}

// --- IMPORTACIÓN / ADMIN ---

async function bulkImportPieces(piecesArray) {
    if (!supabase) {
        throw new Error("No hay conexión con Supabase. Revisa la configuración y el internet.");
    }
    const { data, error } = await supabase
        .from('pieces')
        .insert(piecesArray);
        
    if (error) throw error;
    return data;
}

// --- ESTADÍSTICAS ---

async function getDashboardStats() {
    const { count: totalPieces, error: e1 } = await supabase
        .from('pieces')
        .select('*', { count: 'exact', head: true });

    const today = new Date();
    today.setHours(0,0,0,0);
    
    const { count: movementsToday, error: e2 } = await supabase
        .from('movements')
        .select('*', { count: 'exact', head: true })
        .gte('timestamp', today.toISOString());

    if (e1 || e2) throw (e1 || e2);

    return {
        totalPieces,
        movementsToday
    };
}

async function getRecentMovements(limit = 10) {
    const { data, error } = await supabase
        .from('movements')
        .select(`
            *,
            pieces (name, inventory_number_new),
            origin:origin_container_id (name, caja),
            destination:destination_container_id (name, caja)
        `)
        .order('timestamp', { ascending: false })
        .limit(limit);
        
    if (error) throw error;
    return data;
}

// Hacer funciones accesibles globalmente de forma explícita para evitar ReferenceError
window.initSupabase = initSupabase;
window.getAllPieces = getAllPieces;
window.getPieceById = getPieceById;
window.searchPieces = searchPieces;
window.movePieceToContainer = movePieceToContainer;
window.getDashboardStats = getDashboardStats;
window.getRecentMovements = getRecentMovements;
window.verifyOperatorPIN = verifyOperatorPIN;
window.getContainerById = getContainerById;
window.bulkImportPieces = bulkImportPieces;
window.getAllContainers = getAllContainers;

/*
--- SQL SCHEMA PARA SUPABASE (Postgres) ---
-- Ejecuta esto en el SQL Editor de tu proyecto --

-- 1. Tabla de Operarios
CREATE TABLE operators (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  pin TEXT UNIQUE NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inserta tu primer operario
INSERT INTO operators (name, pin) VALUES ('Juan Museo', '1234');

-- 2. Tabla de Contenedores
CREATE TABLE containers (
  id TEXT PRIMARY KEY, -- Ej: 'C-001'
  name TEXT,           -- Ej: 'Caja de Madera'
  sala TEXT,
  modulo TEXT,
  estanteria TEXT,
  balda TEXT,
  caja TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabla de Piezas
CREATE TABLE pieces (
  id TEXT PRIMARY KEY, -- Ej: 'P-001'
  inventory_number_new TEXT UNIQUE,
  inventory_number_old TEXT,
  name TEXT,
  section TEXT,
  subsection TEXT,
  material TEXT,
  chronology TEXT,
  author TEXT,
  provenance TEXT,
  description TEXT,
  observations TEXT,
  dimensions TEXT,
  other_measurements TEXT,
  conservation TEXT,
  cataloger TEXT,
  cataloging_date TEXT,
  container_id TEXT REFERENCES containers(id),
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Tabla de Movimientos
CREATE TABLE movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  piece_id TEXT REFERENCES pieces(id) ON DELETE CASCADE,
  origin_container_id TEXT REFERENCES containers(id),
  destination_container_id TEXT REFERENCES containers(id),
  operator_id TEXT, -- Guardamos el PIN o Nombre
  timestamp TIMESTAMPTZ DEFAULT NOW()
);
*/
