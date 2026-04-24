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
        // Función auxiliar para buscar campos de forma insensible a mayúsculas
        const getVal = (names) => {
            for (let name of names) {
                // Caso exacto
                if (row[name] !== undefined && row[name] !== null) return row[name];
                // Caso insensible
                const key = Object.keys(row).find(k => k.toLowerCase().trim() === name.toLowerCase().trim());
                if (key && row[key] !== undefined && row[key] !== null) return row[key];
            }
            return null;
        };

        const rawId = getVal(['NUMERACIÓN', 'NIM', 'Nº INV']) || `TEMP-${Date.now()}-${index}`;
        const pieceId = rawId.toString().startsWith('P-') ? rawId : `P-${rawId}`;
        
        const name = (getVal(['TÍTULO', 'DENOMINACIÓN', 'PIEZA']) || 'Sin nombre').toString().trim();
        const objeto = (getVal(['OBJETO']) || name).toString().trim();

        return {
            id: pieceId,
            inventory_number_new: (getVal(['NUMERACIÓN', 'Nº INV']) || pieceId).toString().trim(),
            inventory_number_old: getVal(['NIM', 'Nº ANTERIOR', 'NIM/Nº INV. ANTERIOR']),
            name: name,
            objeto: objeto,
            section: getVal(['SECCIÓN']) || null,
            subsection: getVal(['SUBSECCIÓN']) || null,
            material: getVal(['MATERIA', 'TÉCNICA', 'MATERIAL']) || 'Desconocido',
            chronology: getVal(['EPOCA', 'DATACIÓN', 'CRONOLOGÍA']) || 'Desconocida',
            author: getVal(['AUTOR']) || null,
            provenance: getVal(['PROCEDENCIA', 'PROCEDENCIA ']) || null,
            description: getVal(['DESCRIPCIÓN', 'DESCRIPCIÓN ']) || null,
            observations: getVal(['OBSERVACIONES', 'OBSERVACIONES ']) || null,
            dimensions: `${getVal(['Alto', 'Alto ']) || '0'} x ${getVal(['Ancho', 'Ancho ']) || '0'} x ${getVal(['Profundidad', 'Profundidad ']) || '0'} cm`,
            other_measurements: getVal(['Otra medida', 'Otras medidas']) || null,
            conservation: getVal(['CONSERVACIÓN']) || null,
            cataloger: getVal(['CATALOGADORA/DOR', 'CATALOGADOR']) || null,
            cataloging_date: getVal(['FECHA DE CATALOGACIÓN', 'FECHA']) || null,
            container_id: containerId || null,
            image_url: (() => {
                const foto = getVal(['FOTO', 'foto', 'Foto', 'IMAGEN']);
                if (!foto) {
                    const nim = getVal(['NIM', 'NIM/Nº INV. ANTERIOR']);
                    return nim ? `img/${nim}.jpg` : null;
                }
                const cleanFoto = foto.toString().trim();
                return cleanFoto.startsWith('img/') ? cleanFoto : `img/${cleanFoto}`;
            })(),
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
