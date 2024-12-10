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
            saveCurrentNote();
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

//Elimino la nota dal database remoto se online altrimenti la elimino da locale
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

//Sincronizzo le note eliminate da offline come ripristino la connessione
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

//Elimino note dal database
function removeDeletedNoteFromDB(noteId) {
    const transaction = db.transaction(['deletedNotes'], 'readwrite');
    const store = transaction.objectStore('deletedNotes');

    store.delete(noteId);
    console.log('Nota rimossa dal registro delle eliminazioni:', noteId);
}

//Sincronizzo le note da ripristino connessione
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
                    note.needsSync = false
                } else {
                    // Se la nota non esiste, salvala in IndexedDB
                    saveNoteToDB({
                        id: note.id,
                        name: note.name,
                        content: note.content,
                        language: note.language,
                        needsSync: note.needsSync = false // Non necessita di sincronizzazione poiché proviene dal server
                    });
                    // Aggiorna l'oggetto locale delle note
                    notes[note.id] = {
                        id: note.id,
                        name: note.name,
                        content: note.content,
                        language: note.language,
                        model: createNoteModel(note.content, note.language), // Crea il modello per l'editor Monaco
                        needsSync: note.needsSync = false
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

//Sincronizzazione come rientra la connessione attenddo 8 secondi 
async function synchronizeData() {
    console.log('Inizio sincronizzazione...');
    await syncModifiedNotes(); // Sincronizza le modifiche offline prima
    await syncDeletedNotes(); // Sincronizza le eliminazioni
    await syncNotes(); // Aggiorna le note dal server remoto
    console.log('Sincronizzazione completata con il server remoto');
}

// Seleziona una nota
// Al caricamento di una nota, applica gli evidenziatori
// Selezione di una nota (ripristina gli evidenziatori)
function selectNote(noteId) {
    currentNoteId = noteId;
    const note = notes[noteId];
    editor.setModel(note.model); // Imposta il modello della nota
    applyHighlights(note); // Applica gli evidenziatori
}

//Salvo le note per backup nel database txt
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

//LOAD note dal databse txt manulae
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

//Carico le note nel db remoto se offline scrivo nel dn locale
//Sincronizzo le note se sono offline e passo online
async function syncModifiedNotes() {
    const transaction = db.transaction(['notes'], 'readonly');
    const store = transaction.objectStore('notes');
    const request = store.getAll();

    request.onsuccess = async (event) => {
        const notesToSync = event.target.result.filter(note => note.needsSync); // Filter notes needing sync
        console.log(`Notes to sync: ${notesToSync.length}`); // Log the number of notes to sync

        for (const note of notesToSync) {
            try {
                const response = await fetch(`${serverURL}/carica.php`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(note) // Send the note needing sync
                });

                if (response.ok) {
                    console.log(`Note synchronized with remote server: ${note.id}`);
                    note.needsSync = false; // Update sync status to false
                    saveNoteToDB(note); // Update IndexedDB with the new note state
                } else {
                    console.warn(`Error synchronizing note ${note.id}`);
                }
            } catch (error) {
                console.error(`Error during synchronization of note ${note.id}: ${error.message}`);
            }
        }
    };

    request.onerror = (event) => {
        console.error('Error retrieving notes to sync:', event.target.error);
    };
}

//Salvo le note in indexDB
function saveNoteToDB(note) {
    const noteData = {
        id: note.id,
        name: note.name,
        content: note.content,
        language: note.language,
        highlights: note.highlights || [],
        // needsSync: note.needsSync || true // Indica se necessita di sincronizzazione
        needsSync: typeof note.needsSync === 'boolean' ? note.needsSync : false // Default a true se non è definito
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
                ...note,
                model: createNoteModel(note.content, note.language)
            };

            // Applica gli evidenziatori dopo aver creato il modello
            applyHighlights(notes[note.id]);
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

//Apri il database e creo la sincronizzazione per note da eliminare
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

//Segno la nota da eliminare se sono offline
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

// LOAD NOTE dal SERVER remoto e dal db locale
function loadNotes() {
    fetch(`${serverURL}/load.php`)
        .then(response => response.json())
        .then(remoteNotes => {
            remoteNotes.forEach(note => {
                notes[note.id] = {
                    ...note,
                    model: createNoteModel(note.content, note.language)
                };

                // Applica gli evidenziatori dopo aver creato il modello
                applyHighlights(notes[note.id]);

                // Salva le note anche in IndexedDB
                saveNoteToDB(notes[note.id]);
            });

            renderNotes(); // Aggiorna la lista delle note
            console.log("ON-LINE");
            onlineOffline("ON");
        })
        .catch(error => {
            console.warn('Errore durante il caricamento dal server remoto:', error);
            loadNotesFromDB(); // Fallback su IndexedDB
            console.log("FF-LINE");
            onlineOffline("OFF");
        });
}

// Funzione per esportare il database JSON
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

// Funzione per importare il database JSON
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

// Funzione emoji
function insertEmoji(emoji) {
    const editorModel = editor.getModel(); // Ottieni il modello dell'editor
    const selection = editor.getSelection(); // Ottieni la selezione corrente

    // Posizione iniziale e finale del cursore
    const startOffset = editorModel.getOffsetAt(selection.getStartPosition());
    const endOffset = editorModel.getOffsetAt(selection.getEndPosition());

    // Contenuto dell'editor prima e dopo la selezione
    const content = editorModel.getValue();
    const before = content.slice(0, startOffset);
    const after = content.slice(endOffset);

    // Aggiorna il contenuto con l'emoji
    const updatedContent = before + emoji + after;
    editorModel.setValue(updatedContent);

    // Posiziona il cursore alla fine dell'emoji appena inserita
    const newCursorOffset = startOffset + emoji.length;
    const newCursorPosition = editorModel.getPositionAt(newCursorOffset);
    editor.setPosition(newCursorPosition);
}

let decorations = {}; // Per salvare i decoratori associati alle note
//funzione oggi
// Funzione per evidenziare il testo selezionato
document.getElementById('highlight-button').addEventListener('click', () => {
    if (!currentNoteId) return;

    const selection = editor.getSelection();
    const startOffset = editor.getModel().getOffsetAt(selection.getStartPosition());
    const endOffset = editor.getModel().getOffsetAt(selection.getEndPosition());

    if (startOffset === endOffset) return; // Nessuna selezione

    const note = notes[currentNoteId];
    note.highlights = note.highlights || [];
    note.highlights.push({ start: startOffset, end: endOffset });

    applyHighlights(note); // Applica gli evidenziatori
    saveCurrentNote(); // Salva la nota aggiornata
});

// Rimuovi la
document.getElementById('remove-highlight-button').addEventListener('click', () => {
    if (!currentNoteId) return;

    const selection = editor.getSelection();
    const startOffset = editor.getModel().getOffsetAt(selection.getStartPosition());
    const endOffset = editor.getModel().getOffsetAt(selection.getEndPosition());

    if (startOffset === endOffset) return; // Nessuna selezione

    // Rimuovi l'intervallo dall'array highlights
    const note = notes[currentNoteId];
    if (note.highlights) {
        note.highlights = note.highlights.filter(range => {
            return !(range.start === startOffset && range.end === endOffset);
        });

        // Aggiorna i decoratori
        applyHighlights(note);
        saveCurrentNote(); // Salva la nota aggiornata
    }
});

// Applica gli evidenziatori
function applyHighlights(note) {
    if (!note.highlights) return;

    // Rimuovi eventuali decoratori precedenti
    if (decorations[note.id]) {
        editor.deltaDecorations(decorations[note.id], []);
    }

    // Crea nuovi decoratori
    const newDecorations = note.highlights.map(range => ({
        range: new monaco.Range(
            editor.getModel().getPositionAt(range.start).lineNumber,
            editor.getModel().getPositionAt(range.start).column,
            editor.getModel().getPositionAt(range.end).lineNumber,
            editor.getModel().getPositionAt(range.end).column
        ),
        options: {
            inlineClassName: 'highlight-red' // Stile CSS
        }
    }));

    // Applica i nuovi decoratori
    decorations[note.id] = editor.deltaDecorations([], newDecorations);
}

// Salva la nota con evidenziatori
function saveCurrentNote() {
    if (currentNoteId) {
        const note = notes[currentNoteId];
        note.content = editor.getValue(); // Update the content in the editor
        note.needsSync = true; // Mark the note as needing sync

        // Create a clean copy of the note for serialization
        const noteToSave = {
            id: note.id,
            name: note.name,
            content: note.content,
            language: note.language,
            highlights: note.highlights || [], // Include only necessary properties
            needsSync: note.needsSync
        };

        // Save to IndexedDB
        saveNoteToDB(noteToSave);

        // Attempt to send it to the server if online
        if (navigator.onLine) {
            fetch(`${serverURL}/carica.php`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(noteToSave) // Use the clean note
            })
                .then(response => {
                    if (!response.ok) {
                        throw new Error('Error saving to server');
                    }
                    return response.json();
                })
                .then(data => {
                    if (data.status === 'success') {
                        console.log('Note synchronized with server:', noteToSave);
                        console.log("ON-LINE");
                        onlineOffline("ON");
                        note.needsSync = false; // Synchronization successful
                        saveNoteToDB(noteToSave); // Update IndexedDB
                    }
                })
                .catch(error => {
                    console.error('Error synchronizing with server:', error.message);
                });
        } else {
            console.log("OFF-LINE");
            onlineOffline("OFF");
        }
    }
}

// Crea Monaco Editor per editing testo
require(['vs/editor/editor.main'], function () {

    //Crea Monaco Editor per editing testo
    let minimapEnabled = false;
    let isDarkTheme = true;
    editor = monaco.editor.create(document.getElementById('editor-container'), {
        value: '',
        language: 'html', // Imposta un linguaggio di default
        theme: 'vs-dark', // Tema scuro
        automaticLayout: true,
        minimap: {
            enabled: minimapEnabled  // button minimap
        }
    });

    // Aggiungi evento per il pulsante di cambio tema
    document.getElementById('toggle-theme').addEventListener('click', toggleTheme);
    // Funzione per cambiare il tema
    function toggleTheme() {
        isDarkTheme = !isDarkTheme; // Cambia stato del tema
        const newTheme = isDarkTheme ? 'vs-dark' : 'vs'; // Imposta il nuovo tema
        monaco.editor.setTheme(newTheme); // Cambia il tema dell'editor
    }


    // // Toggle minimap
    // document.getElementById('toggle-minimap').addEventListener('click', () => {
    //     minimapEnabled = !minimapEnabled; // Toggle state
    //     editor.updateOptions({ minimap: { enabled: minimapEnabled } }); // Update editor options
    // });
    // Funzione per attivare/disattivare la minimappa
    function toggleMinimap() {
        minimapEnabled = !minimapEnabled; // Cambia stato
        editor.updateOptions({ minimap: { enabled: minimapEnabled } }); // Aggiorna le opzioni dell'editor
    }

    // Aggiungi evento per il pulsante
    document.getElementById('toggle-minimap').addEventListener('click', toggleMinimap);

    // Aggiungi evento per la combinazione di tasti Ctrl + M
    document.addEventListener('keydown', (event) => {
        if (event.ctrlKey && event.key === 'm') { // Verifica se Ctrl + M è premuto
            event.preventDefault(); // Previene l'azione predefinita
            toggleMinimap(); // Chiama la funzione per attivare/disattivare la minimappa
        }
    });
    //Creazione Nota
    document.getElementById('new-note').addEventListener('click', () => {
        const noteId = Date.now().toString(); // Genera un ID unico per la nota
        const selectedLanguage = document.getElementById('language-selector').value; // Scelta linguaggio
        noteCounter++; // Incrementa contatore da assegnare alla nuova nota
        const defaultNoteName = `Code ${noteCounter}`; // Assenga il nome alla nota con numero incrmentale

        // Crea una nuova nota
        notes[noteId] = {
            id: noteId, // Assegna un unico ID
            name: defaultNoteName, // Dai il default name
            content: '',
            language: selectedLanguage,
            model: createNoteModel('', selectedLanguage) // Xrea il modello in base al linguaggioscelto
        };

        renderNotes();
        selectNote(noteId); // Vai direttamente lalla nota creata
    });

    // Cambia linguaggio
    document.getElementById('language-selector').addEventListener('change', (e) => {
        const language = e.target.value;
        if (currentNoteId) {
            const note = notes[currentNoteId];
            note.language = language; // Aggiorna il linguaggio della nota
            monaco.editor.setModelLanguage(note.model, language); // Cambia il linguaggio del modello
            saveCurrentNote();
        } else {
            // Se nessuna nota è selezionata, cambia solo l'editor
            monaco.editor.setModelLanguage(editor.getModel(), language);
        }
    });
    //oggi
    let autoSaveTimeout;
    editor.onDidChangeModelContent(() => {
        if (currentNoteId) {
            const note = notes[currentNoteId];

            // Aggiorna i range degli evidenziatori
            if (decorations[note.id]) {
                decorations[note.id].forEach((decorationId, index) => {
                    const decorationRange = editor.getModel().getDecorationRange(decorationId);
                    if (decorationRange) {
                        const startOffset = editor.getModel().getOffsetAt(decorationRange.getStartPosition());
                        const endOffset = editor.getModel().getOffsetAt(decorationRange.getEndPosition());
                        note.highlights[index] = { start: startOffset, end: endOffset };
                    }
                });
            }
            saveCurrentNote();
            // Salva automaticamente
            clearTimeout(autoSaveTimeout);
            autoSaveTimeout = setTimeout(() => {
                saveCurrentNote();
                console.log('Auto-saved note:', notes[currentNoteId]);
            }, 500);

            // Anteprima live per HTML
            const language = note.language || 'html';
            if (language === 'html') {
                const iframe = document.getElementById('preview-frame');
                iframe.srcdoc = editor.getValue();
            }
        }
    });

    //Apri anteprima del codice solo se HTML nel Browser
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

    //Menu laterale apri orestringi
    const btnSwitch = document.querySelector('.ri-menu-add-fill');
    let txt = document.querySelector('.btn');
    let sid = document.querySelector('.sidebar');
    let edit = document.querySelector('.editor');
    btnSwitch.addEventListener('click', () => {
        txt.classList.toggle('active');
        sid.classList.toggle('active');
        edit.classList.toggle('active');
    });

    //MENU HAMBURGER
    const openMenu = document.getElementById("btn44");
    const formCon2i = document.querySelector(".wrapperMenu");
    openMenu.addEventListener("click", showForm2i);
    function showForm2i() {
        formCon2i.classList.toggle('active');
    }

    //TATO PREVIEW
    const btnPrev = document.querySelector('.prev');
    let previewr = document.querySelector('.preview');
    btnPrev.addEventListener('click', () => {
        previewr.classList.toggle('active');
    });

    //ESPORTA importa file per database backup
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


    // Funzione auto save ogni 500 variabile timer oggi
    // let autoSaveTimeout; 
    // editor.onDidChangeModelContent(() => {
    //     if (currentNoteId) {
    //         notes[currentNoteId].content = editor.getValue();
    //         clearTimeout(autoSaveTimeout);
    //         this.autoSaveTimeout = setTimeout(() => {
    //             saveCurrentNote();
    //             console.log('Auto-saved note:', notes[currentNoteId]);
    //         }, 1000);
    //     }
    // });

    // Mostra o nasconde il selettore di emoji
    document.getElementById('toggle-emoji-picker').addEventListener('click', () => {
        const emojiPicker = document.getElementById('emoji-picker');
        emojiPicker.style.display = emojiPicker.style.display === 'none' ? 'block' : 'none';
    });

    // Gestisce il clic sulle emoji
    document.querySelectorAll('.emoji').forEach(emojiElement => {
        emojiElement.addEventListener('click', (e) => {
            const emoji = e.target.getAttribute('data-emoji'); // Ottiene il carattere emoji
            insertEmoji(emoji); // Inserisce l'emoji nell'editor
        });
    });

    //Funzione CERCA
    document.getElementById('search-button').addEventListener('click', () => {
        editor.focus(); // Porta il focus sull'editor
        editor.getAction('actions.find').run(); // Attiva la finestra di ricerca
    });




    saveCurrentNote();
    // Inizializza IndexedDB e carica note salvate
    openDatabase();
});

//Salva le note finito il ciclo
saveCurrentNote();

//Salvo il dab note su file di testo
document.getElementById('save-notes-to-file').addEventListener('click', saveNotesToFile);
document.getElementById('load-notes-from-file').addEventListener('change', loadNotesFromFile);

//Sincronizzo come si ripristina la connessione
let autoSaveTimeout1; // Variable to hold the timeout for syncronized
let retryTimeout;
let retryCount = 0;
const MAX_RETRIES = 5; // Numero massimo di tentativi
async function synchronizeWithRetry() {
    if (retryCount >= MAX_RETRIES) {
        console.error('Raggiunto il numero massimo di tentativi di sincronizzazione.');
        console.log("OFF-LINE");
        return;
    }

    const serverReachable = await isServerReachable();
    if (serverReachable) {
        console.log('Connessione al server confermata, avvio sincronizzazione...');
        synchronizeData();

        retryCount = 0; // Resetta i tentativi in caso di successo
    } else {
        console.warn(`Tentativo di sincronizzazione fallito. Riprovo tra 5 secondi... (${retryCount + 1}/${MAX_RETRIES})`);
        retryCount++;
        retryTimeout = setTimeout(synchronizeWithRetry, 5000); // Riprova tra 5 secondi
    }
}

window.addEventListener('online', () => {
    clearTimeout(autoSaveTimeout1);
    clearTimeout(retryTimeout);
    retryCount = 0; // Resetta i tentativi all'evento online
    this.autoSaveTimeout1 = setTimeout(synchronizeWithRetry, 7000); // Avvia con ritardo iniziale
});

async function isServerReachable() {
    try {
        const response = await fetch(`${serverURL}/load.php`, { method: 'HEAD' });
        console.log("ON-LINE");
        onlineOffline("ON");
        return response.ok;
    } catch (error) {
        return false;
    }
}
// End sync

// Apri menu laterale utiliti
const btnutil = document.querySelector('.util');
let menuutili = document.querySelector('.utiliti');
btnutil.addEventListener('click', () => {

    menuutili.classList.toggle('active');

})

const cloud = document.querySelector('.onlines');
const cloudOn = document.querySelector('.ont');
function onlineOffline(condizione) {
    if (condizione === "ON") {
        cloud.innerHTML = '<i class="ri-cloud-line"></i>';
        cloudOn.innerHTML = '<p style=" color: green;"> on-line</p>';

    }
    else {

        cloud.innerHTML = '<i class="ri-cloud-off-line"></i>';
        cloudOn.innerHTML = '<p style=" color: red;"> off-line</p>';

    }
}

