require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.34.1/min/vs' } });
const serverURL = 'https://marchiweb.ddns.net/notes'; // URL corretto del server remoto
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
            deleteNote(id); // Chiama la nuova funzione per eliminare la nota
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
async function deleteNote(noteId) {
    deleteNoteFromDB(noteId); // Elimina la nota da IndexedDB

    try {
        const response = await fetch(`${serverURL}/delete.php`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ id: noteId }) // Invia l'ID della nota da eliminare
        });

        if (!response.ok) {
            throw new Error('Errore nella risposta del server');
        }

        const data = await response.json();
        if (data.status === 'success') {
            console.log(`Nota con ID ${noteId} eliminata dal server remoto`);
        } else {
            console.warn(`Errore durante l'eliminazione dal server: ${data.message}`);
        }
    } catch (error) {
        console.warn(`Non è stato possibile eliminare la nota dal server remoto: ${error.message}`);
        markNoteAsDeleted(noteId); // Registra l'eliminazione in locale
    }

    delete notes[noteId];
    renderNotes(); // Aggiorna l'interfaccia utente
}



async function syncDeletedNotes() {
    const transaction = db.transaction(['deletedNotes'], 'readonly');
    const store = transaction.objectStore('deletedNotes');
    const request = store.getAll();

    request.onsuccess = async (event) => {
        const deletedNotes = event.target.result;

        for (const note of deletedNotes) {
            try {
                const response = await fetch(`${serverURL}/delete.php`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ id: note.id })
                   
                });

                if (response.ok) {
                    console.log(`Nota con ID ${note.id} eliminata dal server remoto durante la sincronizzazione`);
                    removeDeletedNoteFromDB(note.id); // Rimuove la nota dal registro delle eliminazioni
                } else {
                    console.warn(`Errore durante la sincronizzazione dell'eliminazione per la nota ${note.id}`);
                }
            } catch (error) {
                console.error(`Errore durante la sincronizzazione dell'eliminazione per la nota ${note.id}: ${error.message}`);
            }
            deleteNote(note.id);
        }
    };
}

function removeDeletedNoteFromDB(noteId) {
    const transaction = db.transaction(['deletedNotes'], 'readwrite');
    const store = transaction.objectStore('deletedNotes');

    store.delete(noteId);
    console.log('Nota rimossa dal registro delle eliminazioni:', noteId);
}
async function syncNotes() {
    try {
        const response = await fetch(`${serverURL}/load.php`);
        console.log('Risposta:', response);
        
        if (!response.ok) {
            throw new Error('Errore nella risposta del server');
        }

        const remoteNotes = await response.json();
        console.log('Note Remote:', remoteNotes);
        
        remoteNotes.forEach(note => {
            // Controlla se la nota esiste già in IndexedDB
            const transaction = db.transaction(['notes'], 'readonly');
            const store = transaction.objectStore('notes');
            const request = store.get(note.id);
            
            request.onsuccess = () => {
                const localNote = request.result;
                if (localNote) {
                    // Se la nota esiste, puoi scegliere di aggiornarla o saltarla
                    console.log(`Nota con ID ${note.id} già esistente in IndexedDB.`);
                } else {
                    // Se la nota non esiste, salvala in IndexedDB
                    saveNoteToDB({
                        id: note.id,
                        name: note.name,
                        content: note.content,
                        language: note.language,
                        needsSync: false // Non necessita di sincronizzazione poiché proviene dal server
                    });
                    // Aggiorna l'oggetto locale delle note
                    notes[note.id] = {
                        id: note.id,
                        name: note.name,
                        content: note.content,
                        language: note.language,
                        model: createNoteModel(note.content, note.language) // Crea il modello per l'editor Monaco
                    };
                    console.log(`Nota aggiunta da remoto: ${note.id}`);
                }
            };

            request.onerror = (event) => {
                console.error(`Errore nel controllo della nota ${note.id}:`, event.target.error);
            };
        });
        
        renderNotes(); // Aggiorna l'interfaccia utente con le note
    } catch (error) {
        console.error('Errore durante la sincronizzazione delle note:', error.message);
        loadNotesFromDB(); // Ripiega su caricamento delle note da IndexedDB
    }
}
// async function syncNotes() { 
//     try { 
//         const response = await fetch(`${serverURL}/load.php`); 
//         if (!response.ok) { 
//             throw new Error('Errore nella risposta del server'); 
//         } 
//         const remoteNotes = await response.json(); 
//         remoteNotes.forEach(note => { 
//             // Controlla se la nota esiste in IndexedDB e ha `needsSync: true` 
//             const transaction = db.transaction(['notes'], 'readonly'); 
//             const store = transaction.objectStore('notes'); 
//             const request = store.get(note.id); 
//             request.onsuccess = () => { 
//                 const localNote = request.result; 
//                 if (localNote && localNote.needsSync) { 
//                     console.log(`Nota locale con ID ${note.id} ha modifiche offline, non sovrascrivere.`); 
//                     return; // Saltiamo la sincronizzazione per questa nota 
//                 } 
//                 // Aggiorna IndexedDB con la nota dal server 
//                 saveNoteToDB({ 
//                     id: note.id, 
//                     name: note.name, 
//                     content: note.content, 
//                     language: note.language, 
//                     needsSync: false // Dal server, non necessita di sincronizzazione 
//                 }); 
//                 // Aggiorna la memoria locale 
//                 notes[note.id] = { 
//                     id: note.id, 
//                     name: note.name, 
//                     content: note.content, 
//                     language: note.language, 
//                     model: createNoteModel(note.content, note.language) 
//                 }; 
//                 console.log(`Nota aggiornata da remoto: ${note.id}`); 
//             }; 
//             request.onerror = (event) => { 
//                 console.error(`Errore nel controllo della nota ${note.id}:`, event.target.error); 
//             }; 
//         }); 
//         renderNotes(); // Aggiorna l'interfaccia utente 
//     } catch (error) { 
//         console.error('Errore durante la sincronizzazione delle note:', error.message); 
//     } 
// } 
async function synchronizeData() {
    console.log('Inizio sincronizzazione...');

    await syncModifiedNotes(); // Sincronizza le modifiche offline prima
    await syncDeletedNotes(); // Sincronizza le eliminazioni
    await syncNotes(); // Aggiorna le note dal server remoto

    console.log('Sincronizzazione completata con il server remoto');
}

// async function synchronizeData() {
//     await syncDeletedNotes(); // Sincronizza le eliminazioni
//     await syncModifiedNotes(); // Sincronizza le modifiche fatte offline
//     await syncNotes(); // Sincronizza modifiche e aggiunte dal server remoto
//     // await syncDeletedNotes(); // Sincronizza le eliminazioni
//     // await syncNotes(); // Sincronizza modifiche e aggiunte
//     // await saveCurrentNote();
// }

// Seleziona una nota
function selectNote(noteId) {
    currentNoteId = noteId;
    const note = notes[noteId];
    editor.setModel(note.model); // Imposta il modello della nota selezionata
    saveCurrentNote();
   
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
//         //saveNoteToDB(note);
//     }
// }
function saveCurrentNote() {
    if (currentNoteId) {
        const note = notes[currentNoteId];
        note.content = editor.getValue(); // Aggiorna il contenuto nell'editor

        // Indica che la nota necessita di sincronizzazione
        note.needsSync = true;

        // Salva la nota in IndexedDB
        saveNoteToDB(note);

        // Prova a inviarla al server (solo se online)
        if (navigator.onLine) {
            fetch(`${serverURL}/carica.php`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    id: note.id,
                    name: note.name,
                    content: note.content,
                    language: note.language
                })
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error('Errore nel salvataggio sul server');
                }
                return response.json();
            })
            .then(data => {
                if (data.status === 'success') {
                    console.log('Nota sincronizzata con il server:', note);
                    note.needsSync = false; // Sincronizzazione riuscita
                    saveNoteToDB(note); // Aggiorna IndexedDB
                }
            })
            .catch(error => {
                console.error('Errore nella sincronizzazione con il server:', error.message);
            });
        }
    }
}
async function syncModifiedNotes() {
    const transaction = db.transaction(['notes'], 'readonly');
    const store = transaction.objectStore('notes');
    const request = store.getAll();

    request.onsuccess = async (event) => {
        const notesToSync = event.target.result.filter(note => note.needsSync);

        for (const note of notesToSync) {
            try {
                const response = await fetch(`${serverURL}/carica.php`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        id: note.id,
                        name: note.name,
                        content: note.content,
                        language: note.language
                    })
                });

                if (response.ok) {
                    console.log(`Nota sincronizzata con il server remoto: ${note.id}`);
                    note.needsSync = false; // Aggiorna lo stato di sincronizzazione
                    saveNoteToDB(note); // Aggiorna IndexedDB
                } else {
                    console.warn(`Errore nella sincronizzazione della nota ${note.id}`);
                }
            } catch (error) {
                console.error(`Errore durante la sincronizzazione della nota ${note.id}: ${error.message}`);
            }
        }
    };

    request.onerror = (event) => {
        console.error('Errore nel recupero delle note da sincronizzare:', event.target.error);
    };
}


// function saveNoteToDB(note) {
//     const noteData = {
//         id: note.id,
//         name: note.name,
//         content: note.content,
//         language: note.language
//     };

//     const transaction = db.transaction(['notes'], 'readwrite');
//     const store = transaction.objectStore('notes');

//     const request = store.put(noteData); 
//     request.onsuccess = () => {
//         console.log('Note saved in IndexedDB:', noteData);
//     };
//     request.onerror = (event) => {
//         console.error('Error saving note:', event.target.error);
//     };
// }
function saveNoteToDB(note) {
    const noteData = {
        id: note.id,
        name: note.name,
        content: note.content,
        language: note.language,
        needsSync: note.needsSync || false // Indica se necessita di sincronizzazione
    };

    const transaction = db.transaction(['notes'], 'readwrite');
    const store = transaction.objectStore('notes');

    const request = store.put(noteData); 
    request.onsuccess = () => {
        console.log('Nota salvata in IndexedDB:', noteData);
    };
    request.onerror = (event) => {
        console.error('Errore nel salvataggio della nota:', event.target.error);
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
// function openDatabase() {
//     const request = indexedDB.open('NotesAppDB', 1);
//     request.onupgradeneeded = (event) => {
//         const database = event.target.result;
//         // Crea una store per le note se non esiste
//         if (!database.objectStoreNames.contains('notes')) {
//             database.createObjectStore('notes', { keyPath: 'id' });
//         }
//     };
//     request.onsuccess = (event) => {
//         db = event.target.result;
//         console.log('Database aperto con successo!');
//         loadNotesFromDB(); // Carica le note salvate
//     };
//     request.onerror = (event) => {
//         console.error('Errore nell\'apertura del database:', event.target.errorCode);
//     };
// }

// Funzione per aprire IndexedDB e caricare le note remoto
// function openDatabase() {
//     const request = indexedDB.open('NotesAppDB', 1);
//     request.onupgradeneeded = (event) => {
//         const database = event.target.result;
//         if (!database.objectStoreNames.contains('notes')) {
//             database.createObjectStore('notes', { keyPath: 'id' });
//         }
//     };
//     request.onsuccess = (event) => {
//         db = event.target.result;
//         console.log('Database IndexedDB aperto con successo!');
        
//         // Carica le note dal server remoto o da IndexedDB
//         loadNotes();
//     };
//     request.onerror = (event) => {
//         console.error('Errore nell\'apertura del database:', event.target.errorCode);
//     };
// }
function openDatabase() {
    const request = indexedDB.open('NotesAppDB', 1);

    request.onupgradeneeded = (event) => {
        const database = event.target.result;

        // Crea la store per le note, se non esiste
        if (!database.objectStoreNames.contains('notes')) {
            database.createObjectStore('notes', { keyPath: 'id' });
        }

        // Crea la store per le note eliminate, se non esiste
        if (!database.objectStoreNames.contains('deletedNotes')) {
            database.createObjectStore('deletedNotes', { keyPath: 'id' });
        }
    };

    request.onsuccess = (event) => {
        db = event.target.result;
        console.log('Database IndexedDB aperto con successo!');
        loadNotes(); // Carica le note dal server remoto o da IndexedDB
    };

    request.onerror = (event) => {
        console.error('Errore nell\'apertura del database:', event.target.errorCode);
    };
}

function markNoteAsDeleted(noteId) {
    const transaction = db.transaction(['deletedNotes'], 'readwrite');
    const store = transaction.objectStore('deletedNotes');

    const request = store.put({ id: noteId }); // Aggiunge l'ID della nota eliminata
    request.onsuccess = () => {
        console.log('Nota segnata come eliminata:', noteId);
    };
    request.onerror = (event) => {
        console.error('Errore nel registrare l\'eliminazione:', event.target.error);
    };
}


async function loadNotes() {
    try {
        // Tentativo di recuperare le note dal database remoto
        const response = await fetch('https://marchiweb.ddns.net/notes/load.php');
        if (!response.ok) {
            throw new Error('Errore nella risposta del server');
        }
        const remoteNotes = await response.json();

        // Salva le note recuperate anche in IndexedDB
        remoteNotes.forEach(note => {
            notes[note.id] = {
                ...note,
                model: createNoteModel(note.content, note.language), // Ricrea il modello Monaco Editor
            };
            saveNoteToDB(notes[note.id]); // Sincronizza con IndexedDB
        });

        renderNotes(); // Aggiorna l'interfaccia con le note remote
        console.log('Note caricate dal server remoto:', remoteNotes);
    } catch (error) {
        console.warn('Errore durante il caricamento dal server remoto:', error.message);

        // Recupera le note da IndexedDB come fallback
        loadNotesFromDB();
    }
    loadNotesFromDB();
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
                saveCurrentNote(); // Call the save function
                
                console.log('Auto-saved note:', notes[currentNoteId]); // Log the auto-save action
            }, 500); // Adjust the time as needed (1000 milliseconds = 1 second)
        }
    });
    // Inizializza IndexedDB e carica note salvate
    saveCurrentNote();
    openDatabase();
});
saveCurrentNote();
document.getElementById('save-notes-to-file').addEventListener('click', saveNotesToFile);
document.getElementById('load-notes-from-file').addEventListener('change', loadNotesFromFile);
let autoSaveTimeout1; // Variable to hold the timeout for syncronized
window.addEventListener('online', () => {
    //console.log('Connessione ripristinata, avvio sincronizzazione...');
    // Clear the previous timeout if it exists
    clearTimeout(autoSaveTimeout1);
    
    // Set a new timeout to save after 1 second of inactivity
   this.autoSaveTimeout1 = setTimeout(() => {
    console.log('Connessione ripristinata, avvio sincronizzazione...');
    synchronizeData();
        
      
    }, 7000); // Adjust the time as needed (1000 milliseconds = 1 second)
    
});
