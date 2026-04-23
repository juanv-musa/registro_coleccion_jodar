/**
 * Herramienta de Migración / Importación
 * Utiliza: PapaParse para procesamiento de CSV y SheetJS para XLSX
 */

/**
 * Procesa un archivo CSV
 */
function parseCSVInventory(file, containerId, onComplete, onError) {
    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
            try {
                const mappedData = mapToSupabase(results.data, containerId);
                onComplete(mappedData);
            } catch (err) {
                onError(err.message);
            }
        },
        error: (err) => {
            onError(err.message);
        }
    });
}

/**
 * Procesa un archivo Excel (.xlsx, .xls)
 */
function parseExcelInventory(file, containerId, onComplete, onError) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);
            
            const mappedData = mapToSupabase(jsonData, containerId);
            onComplete(mappedData);
        } catch (err) {
            onError(err.message);
        }
    };
    reader.onerror = (err) => onError(err.message);
    reader.readAsArrayBuffer(file);
}

/**
 * Mapea las columnas del usuario a nuestra base de datos
 * @param {Array} data - Filas crudas del archivo
 * @param {string|null} containerId - ID del contenedor de destino
 */
function mapToSupabase(data, containerId) {
    return data.map((row, index) => {
        const rawId = row['NUMERACIÓN'] || row['NIM'] || `TEMP-${Date.now()}-${index}`;
        const pieceId = rawId.toString().startsWith('P-') ? rawId : `P-${rawId}`;
        
        return {
            id: pieceId,
            inventory_number_new: row['NUMERACIÓN'] || pieceId,
            inventory_number_old: row['NIM'] || null,
            name: row['TÍTULO'] || row['OBJETO'] || 'Sin nombre',
            section: row['SECCIÓN'] || null,
            subsection: row['SUBSECCIÓN'] || null,
            material: row['MATERIA'] || row['TÉCNICA'] || 'Desconocido',
            chronology: row['EPOCA'] || row['DATACIÓN'] || 'Desconocida',
            author: row['AUTOR'] || null,
            provenance: row['PROCEDENCIA '] || row['PROCEDENCIA'] || null,
            description: row['DESCRIPCIÓN '] || row['DESCRIPCIÓN'] || null,
            observations: row['OBSERVACIONES '] || row['OBSERVACIONES'] || null,
            dimensions: `${row['Alto '] || row['Alto'] || '0'} x ${row['Ancho'] || '0'} x ${row['Profundidad '] || row['Profundidad'] || '0'} cm`,
            other_measurements: row['Otra medida'] || null,
            conservation: row['CONSERVACIÓN'] || null,
            cataloger: row['CATALOGADORA/DOR'] || null,
            cataloging_date: row['FECHA DE CATALOGACIÓN'] || null,
            container_id: containerId || null,
            image_url: row['FOTO'] || (row['NIM'] ? `img/${row['NIM']}.jpg` : null),
            updated_at: new Date()
        };
    });
}

/**
 * Sube los datos mapeados a Supabase
 * @param {Array} data 
 */
async function uploadToSupabase(data) {
    // Pasamos data como piezas y un array vacío [] como contenedores
    return await window.bulkImportPieces(data, []);
}

// Global exposure
window.parseCSVInventory = parseCSVInventory;
window.parseExcelInventory = parseExcelInventory;
window.uploadToSupabase = uploadToSupabase;
