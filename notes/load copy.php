<?php
header("Access-Control-Allow-Origin: *"); // Consente richieste da qualsiasi origine
header("Access-Control-Allow-Methods: GET, POST, OPTIONS"); // Specifica i metodi consentiti
header("Access-Control-Allow-Headers: Content-Type, Authorization"); // Specifica gli header consentiti
// Crea o apri il database SQLite
$db = new PDO('sqlite:notes.db');
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

// Crea la tabella delle note se non esiste
// $db->exec("CREATE TABLE IF NOT EXISTS notes (
//     id TEXT PRIMARY KEY,
//     name TEXT,
//     content TEXT,
//     language TEXT,
//     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
//     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
// )");
$db->exec("CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    name TEXT,
    content TEXT,
    language TEXT,
    highlights TEXT, -- Campo JSON per gli intervalli evidenziati
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)");


if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // Recupera tutte le note dal database
    $stmt = $db->query("SELECT id, name, content, language, highlights, updated_at FROM notes ORDER BY updated_at DESC");
    $notes = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Decodifica il campo highlights da JSON (se presente)
    foreach ($notes as &$note) {
        if (!empty($note['highlights'])) {
            $note['highlights'] = json_decode($note['highlights'], true);
        } else {
            $note['highlights'] = [];
        }
    }

    // Restituisci le note in formato JSON
    echo json_encode($notes);
} else {
    echo json_encode(['status' => 'error', 'message' => 'Invalid request method']);
}

?>
