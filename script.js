require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.34.1/min/vs' } });

let currentNoteId = null; // ID della nota attualmente selezionata
const notes = {}; // Oggetto per salvare le note
const notesList = document.getElementById('notes-list');
let editor; // Dichiarare la variabile editor
let db; // Dichiarare la variabile db
let noteCounter = 0; // Contatore globale per le note

// Funzione per creare un nuovo modello per una nota
function createNoteModel(content, language) {
    return monaco.editor.createModel(content, language);
}

// Funzione per visualizzare le note
function renderNotes() {
    notesList.innerHTML = '';
    Object.entries(notes).forEach(([id, note]) => {
        const noteElement = document.createElement('li');
        // Nome della nota
        const noteName = document.createElement('span');
        noteName.textContent = note.name || `Code ${Object.keys(notes).length}`;
        noteName.classList.add('note-name');
        noteName.contentEditable = true; // Rende il nome modificabile
        noteName.addEventListener('blur', () => {
            note.name = noteName.textContent.trim(); // Aggiorna il nome della nota
            renderNotes();
        });
        // Pulsante Cancella
        const deleteButton = document.createElement('button');
        deleteButton.innerHTML = '<i class="ri-delete-bin-line"></i>';
        deleteButton.classList.add('delete-note');
        deleteButton.addEventListener('click', (e) => {
            e.stopPropagation();
            delete notes[id];
            deleteNoteFromDB(id); // Elimina la nota da IndexedDB
            renderNotes();
            if (currentNoteId === id) {
                editor.setValue('');
                currentNoteId = null;
            }
        });
        noteElement.appendChild(noteName);
        noteElement.appendChild(deleteButton);
        noteElement.dataset.id = id;
        // Event Listener per selezionare la nota
        noteElement.addEventListener('click', () => {
            saveCurrentNote(); // Assicurati che questa funzione sia definita
            selectNote(id);
        });
        notesList.appendChild(noteElement);
    });
}

// Seleziona una nota
function selectNote(noteId) {
    currentNoteId = noteId;
    const note = notes[noteId];
    editor.setModel(note.model); // Imposta il modello della nota selezionata
}
function saveNotesToFile() {
    const notesToSave = Object.entries(notes).map(([id, note]) => ({
        id: note.id,
        name: note.name,
        content: note.content,
        language: note.language
    }));
    
    const data = JSON.stringify(notesToSave, null, 2); // Converti le note in formato JSON
    const blob = new Blob([data], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'database.txt'; // Nome del file di salvataggio
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url); // Pulisci l'oggetto URL
    console.log('Note salvate nel file:', 'database.txt');
}
function loadNotesFromFile(event) {
    const file = event.target.files[0];
    const reader = new FileReader();
    
    reader.onload = (e) => {
        const content = e.target.result;
        const loadedNotes = JSON.parse(content); // Analizza il contenuto JSON
        Object.entries(loadedNotes).forEach(([id, note]) => {
            notes[id] = {
                id: note.id,
                name: note.name,
                content: note.content,
                language: note.language,
                model: createNoteModel(note.content, note.language) // Crea il modello per ogni nota
            };
           // Salva la nota in IndexedDB
           saveNoteToDB(notes[id]);
        });
        renderNotes(); // Rendi visibili le note caricate
        console.log('Note caricate dal file:', 'database.txt');
      
    };

    reader.readAsText(file);
    
}
// CON QUESTA FUNZIONE SALVO SOLO NEL indexDB
function saveCurrentNote() {
    if (currentNoteId) {
        const note = notes[currentNoteId];
        note.content = editor.getValue(); // Aggiorna il contenuto dell'editor

        // Logga i dati della nota prima di salvarli
        console.log('Dati della nota da salvare:', {
            id: note.id,
            name: note.name,
            content: note.content,
            language: note.language
        });

        saveNoteToDB(note); // Salva la nota in IndexedDB
    }
}
// CON QUESTA FUNZIONE SALVO PRIMA NEL SERVER REMOTO SE NON ESISTE SALVO INindexDB comunque salvo in tutti e due cosi se non esiste il db recupero solo dal db indexDB
// function saveCurrentNote() {
//     if (currentNoteId) {
//         const note = notes[currentNoteId];
//         // note.content = editor.getValue(); // Aggiorna il contenuto dell'editor

//         // Crea un oggetto da inviare, escludendo il modello
//         const noteData = {
//             id: note.id,
//             name: note.name,
//             content: note.content,
//             language: note.language
//         };

//         // Logga l'oggetto per il debug
//         console.log('Dati della nota da salvare:', noteData);

//         // Prova a inviare al server
//         fetch('http://localhost/notes/carica.php', {
//             method: 'POST',
//             headers: {
//                 'Content-Type': 'application/json'
//             },
//             body: JSON.stringify(noteData) // Usa l'oggetto senza riferimenti circolari
        
//         })
//         .then(response => {
//             if (!response.ok) {
//                 console.warn('Server non raggiungibile, salvataggio in IndexedDB');
//                 saveNoteToDB(note); // Salva in IndexedDB
//             } else {
               
//                 return response.json();
//             }
//         })
//         .then(data => {
//             if (data && data.status === 'success') {
//                 console.log('Nota salvata sul server:', note);
//             }
//         })
//         .catch(error => {
//             console.error('Errore nella richiesta:', error);
//             // Salva in IndexedDB se c'è un errore
//             saveNoteToDB(note);
//         });
//         // Scelgo di salvare sempre anche in idexDB poi vedo se eliminarla 
//         saveNoteToDB(note);
//     }
// }

function saveNoteToDB(note) {
    const noteData = {
        id: note.id,
        name: note.name,
        content: note.content,
        language: note.language
    };

    const transaction = db.transaction(['notes'], 'readwrite');
    const store = transaction.objectStore('notes');

    const request = store.put(noteData); 
    request.onsuccess = () => {
        console.log('Note saved in IndexedDB:', noteData);
    };
    request.onerror = (event) => {
        console.error('Error saving note:', event.target.error);
    };
}


// Carica tutte le note da IndexedDB
function loadNotesFromDB() {
    const transaction = db.transaction(['notes'], 'readonly');
    const store = transaction.objectStore('notes');
    const request = store.getAll();
    
    request.onsuccess = (event) => {
        const savedNotes = event.target.result;
        savedNotes.forEach((note) => {
            notes[note.id] = {
                id: note.id,
                name: note.name,
                content: note.content,
                language: note.language,
                model: createNoteModel(note.content, note.language) // Ricrea il modello
            };
        });
        renderNotes(); // Ricostruisce l'interfaccia con le note caricate
        console.log('Note caricate da IndexedDB:', savedNotes);
    };
    request.onerror = (event) => {
        console.error('Errore nel caricamento delle note da IndexedDB:', event.target.error);
    };
}
// Cancella una nota da IndexedDB
function deleteNoteFromDB(noteId) {
    const transaction = db.transaction(['notes'], 'readwrite');
    const store = transaction.objectStore('notes');
    store.delete(noteId);
    console.log('Nota eliminata da IndexedDB:', noteId);
}

// Funzione per aprire IndexedDB
function openDatabase() {
    const request = indexedDB.open('NotesAppDB', 1);
    request.onupgradeneeded = (event) => {
        const database = event.target.result;
        // Crea una store per le note se non esiste
        if (!database.objectStoreNames.contains('notes')) {
            database.createObjectStore('notes', { keyPath: 'id' });
        }
    };
    request.onsuccess = (event) => {
        db = event.target.result;
        console.log('Database aperto con successo!');
        loadNotesFromDB(); // Carica le note salvate
    };
    request.onerror = (event) => {
        console.error('Errore nell\'apertura del database:', event.target.errorCode);
    };
}

// Funzione per esportare il database
function exportDatabase() {
    const transaction = db.transaction(['notes'], 'readonly');
    const store = transaction.objectStore('notes');
    const request = store.getAll();
    request.onsuccess = (event) => {
        const savedNotes = event.target.result;
        const data = JSON.stringify(savedNotes);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'notes_backup.json';
        link.click();
        console.log('Database esportato con successo!');
    };
    request.onerror = (event) => {
        console.error('Errore nell\'esportazione del database:', event.target.errorCode);
    };
}

// Funzione per importare il database
function importDatabase(file) {
    const reader = new FileReader();
    reader.onload = (event) => {
        const data = JSON.parse(event.target.result);
        const transaction = db.transaction(['notes'], 'readwrite');
        const store = transaction.objectStore('notes');
        data.forEach((note) => {
            store.put(note); // Salva ogni nota in IndexedDB
            notes[note.id] = {
                ...note,
                model: createNoteModel(note.content, note.language),
            };
        });
        renderNotes();
        console.log('Database importato con successo!');
    };
    reader.readAsText(file);
}

// Crea Monaco Editor
require(['vs/editor/editor.main'], function () {
    editor = monaco.editor.create(document.getElementById('editor-container'), {
        value: '',
        language: 'html', // Imposta un linguaggio di default
        theme: 'vs-dark', // Tema scuro
        automaticLayout: true
    });

    document.getElementById('new-note').addEventListener('click', () => {
        const noteId = Date.now().toString(); // Generate a unique ID for the note
        const selectedLanguage = document.getElementById('language-selector').value; // Get the selected language
        noteCounter++; // Increment the counter
        const defaultNoteName = `Code ${noteCounter}`; // Default progressive name based on the counter
    
        // Create a new note with an associated model
        notes[noteId] = {
            id: noteId, // Assign the unique ID here
            name: defaultNoteName, // Set the default name
            content: '',
            language: selectedLanguage,
            model: createNoteModel('', selectedLanguage) // Create an empty model with the selected language
        };
        renderNotes();
        selectNote(noteId); // Automatically select the new note
    });

    // Cambia linguaggio
    document.getElementById('language-selector').addEventListener('change', (e) => {
        const language = e.target.value;
        if (currentNoteId) {
            const note = notes[currentNoteId];
            note.language = language; // Aggiorna il linguaggio della nota
            monaco.editor.setModelLanguage(note.model, language); // Cambia il linguaggio del modello
        } else {
            // Se nessuna nota è selezionata, cambia solo l'editor
            monaco.editor.setModelLanguage(editor.getModel(), language);
        }
    });

    editor.onDidChangeModelContent(() => {
        if (currentNoteId) {
            notes[currentNoteId].content = editor.getValue();
        }
        // Anteprima live solo per HTML
        const language = notes[currentNoteId]?.language || 'html';
        if (language === 'html') {
            const iframe = document.getElementById('preview-frame');
            const htmlContent = editor.getValue();
            iframe.srcdoc = htmlContent; // Aggiorna il contenuto dell'iframe
        }
    });

    document.getElementById('open-in-new-tab').addEventListener('click', () => {
        const language = notes[currentNoteId]?.language || 'html';
        if (language === 'html') {
            const htmlContent = editor.getValue(); // Ottieni il contenuto dell'editor
            const newTab = window.open(); // Apri una nuova scheda
            newTab.document.open(); // Apri il documento nella nuova scheda
            newTab.document.write(htmlContent); // Scrivi il contenuto HTML
            newTab.document.close(); // Chiudi il flusso di scrittura
        } else {
            alert('Live preview is only available for HTML content.');
        }
    });

    const btnSwitch = document.querySelector('.ri-menu-add-fill');
    let txt = document.querySelector('.btn');
    let sid = document.querySelector('.sidebar');
    let edit = document.querySelector('.editor');
    btnSwitch.addEventListener('click', () => {
        txt.classList.toggle('active');
        sid.classList.toggle('active');
        edit.classList.toggle('active');
    });
  

    const openMenu = document.getElementById("btn44");
    const formCon2i = document.querySelector(".wrapperMenu");
    openMenu.addEventListener("click", showForm2i);
    function showForm2i() {
      formCon2i.classList.toggle('active');
    }
   


    const btnPrev = document.querySelector('.prev');
    let previewr = document.querySelector('.preview');
    btnPrev.addEventListener('click', () => {
        previewr.classList.toggle('active');
    });

    document.getElementById('export-db').addEventListener('click', exportDatabase);
    document.getElementById('import-db').addEventListener('click', () => {
        document.getElementById('import-file').click();
    });

    // Gestisci il caricamento del file
    document.getElementById('import-file').addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            importDatabase(file);
        }
    });
    let autoSaveTimeout; // Variable to hold the timeout for debouncing

    editor.onDidChangeModelContent(() => {
        if (currentNoteId) {
            notes[currentNoteId].content = editor.getValue(); // Update the content in memory
    
            // Clear the previous timeout if it exists
            clearTimeout(autoSaveTimeout);
    
            // Set a new timeout to save after 1 second of inactivity
           this.autoSaveTimeout = setTimeout(() => {
                // saveCurrentNote(); // Call the save function
                Invoke(new saveCurrentNote());
                console.log('Auto-saved note:', notes[currentNoteId]); // Log the auto-save action
            }, 500); // Adjust the time as needed (1000 milliseconds = 1 second)
        }
    });
    // Inizializza IndexedDB e carica note salvate
    openDatabase();
});

document.getElementById('save-notes-to-file').addEventListener('click', saveNotesToFile);
document.getElementById('load-notes-from-file').addEventListener('change', loadNotesFromFile);