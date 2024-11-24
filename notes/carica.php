<?php
header("Access-Control-Allow-Origin: *"); // Consente richieste da qualsiasi origine
header("Access-Control-Allow-Methods: GET, POST, OPTIONS"); // Specifica i metodi consentiti
header("Access-Control-Allow-Headers: Content-Type, Authorization"); // Specifica gli header consentiti
// Create or open the SQLite database
$db = new PDO('sqlite:notes.db');
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

// Create the notes table if it doesn't exist
$db->exec("CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    name TEXT,
    content TEXT,
    language TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)");

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    
    if (isset($data['id']) && isset($data['name']) && isset($data['content']) && isset($data['language'])) {
        // Prepare the SQL statement
        $stmt = $db->prepare("INSERT INTO notes (id, name, content, language, updated_at) VALUES (:id, :name, :content, :language, CURRENT_TIMESTAMP)
                               ON CONFLICT(id) DO UPDATE SET name = excluded.name, content = excluded.content, language = excluded.language, updated_at = CURRENT_TIMESTAMP");
        
        // Bind parameters
        $stmt->bindParam(':id', $data['id']);
        $stmt->bindParam(':name', $data['name']);
        $stmt->bindParam(':content', $data['content']);
        $stmt->bindParam(':language', $data['language']);
        
        // Execute the statement
        if ($stmt->execute()) {
            echo json_encode(['status' => 'success']);
        } else {
            echo json_encode(['status' => 'error', 'message' => 'Failed to save note']);
        }
    } else {
        echo json_encode(['status' => 'error', 'message' => 'Invalid data']);
    }
} else {
    echo json_encode(['status' => 'error', 'message' => 'Invalid request']);
}
?>