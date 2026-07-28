<?php
// Endpoint local de persistance des commentaires du viewer.
//   GET  -> renvoie comments.json ({version,comments:[]} si absent)
//   POST -> valide le JSON et réécrit le fichier entier
// Sert sur l'hébergement statique+PHP (aucun Node requis).

header('Content-Type: application/json; charset=utf-8');
$file = __DIR__ . '/comments.json';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    header('Cache-Control: no-store');
    echo is_file($file) ? file_get_contents($file) : "{\"version\":1,\"comments\":[]}";
    exit;
}

if ($method === 'POST') {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        http_response_code(400);
        echo '{"ok":false,"error":"invalid json"}';
        exit;
    }
    $ok = file_put_contents(
        $file,
        json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n"
    );
    if ($ok === false) {
        http_response_code(500);
        echo '{"ok":false,"error":"write failed"}';
        exit;
    }
    echo '{"ok":true}';
    exit;
}

http_response_code(405);
echo '{"ok":false,"error":"method not allowed"}';
