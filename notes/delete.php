<?php
header("Access-Control-Allow-Origin: *"); // Consente richieste da qualsiasi origine
header("Access-Control-Allow-Methods: GET, POST, OPTIONS"); // Specifica i metodi consentiti
header("Access-Control-Allow-Headers: Content-Type, Authorization"); // Specifica gli header consentiti

// Connetti al database SQLite
$db = new PDO('sqlite:notes.db');
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

// Controlla se la richiesta è di tipo POST
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);

    if (isset($data['id'])) {
        // Prepara la query per eliminare la nota
        $stmt = $db->prepare("DELETE FROM notes WHERE id = :id");
        $stmt->bindParam(':id', $data['id']);

        if ($stmt->execute()) {
            echo json_encode(['status' => 'success']);
        } else {
            echo json_encode(['status' => 'error', 'message' => 'Failed to delete note']);
        }
    } else {
        echo json_encode(['status' => 'error', 'message' => 'Invalid data']);
    }
} else {
    echo json_encode(['status' => 'error', 'message' => 'Invalid request method']);
}
?>
