// Inizializza Monaco Editor
require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.34.1/min/vs' } });
require(['vs/editor/editor.main'], function () {
    let currentNoteId = null; // ID della nota attualmente selezionata
    const notes = {}; // Oggetto per salvare le note
    const notesList = document.getElementById('notes-list');

    // Crea Monaco Editor
    const selectedLanguage = document.getElementById('language-selector').value; // Ottieni il linguaggio selezionato
    const editor = monaco.editor.create(document.getElementById('editor-container'), {
        value: '',
        language: selectedLanguage, // Imposta il linguaggio selezionato come predefinito
        theme: 'vs-dark',       // Tema scuro
        automaticLayout: true
    });

    // Funzione per caricare un linguaggio
    function loadLanguage(language) {
        console.log(`Caricamento linguaggio: ${language}`); // Log del linguaggio
        require([`vs/basic-languages/${language}/${language}`], () => {
            editor.updateOptions({ language });
            console.log(`Linguaggio ${language} caricato.`); // Log per confermare il caricamento
            
            // Ricarica il contenuto dell'editor
            if (currentNoteId) {
                const content = notes[currentNoteId].content; // Ottieni il contenuto della nota
                editor.setValue(content); // Imposta il contenuto dell'editor
                editor.setPosition({ lineNumber: 1, column: 1 }); // Riporta il cursore all'inizio
            }
        });
    }

    // Salva automaticamente il contenuto ogni volta che cambia
    editor.onDidChangeModelContent(() => {
        if (currentNoteId) {
            notes[currentNoteId].content = editor.getValue();
        }
    });

    // Aggiungi nuova nota
    document.getElementById('new-note').addEventListener('click', () => {
        const noteId = Date.now().toString(); // Genera un ID unico per la nota
        const selectedLanguage = document.getElementById('language-selector').value; // Ottieni il linguaggio selezionato
        notes[noteId] = { content: '', language: selectedLanguage, name: `Code ${Object.keys(notes).length + 1}` }; // Imposta il linguaggio selezionato per la nuova nota
        renderNotes();
        selectNote(noteId);
    });

    // Renderizza l'elenco delle note
    function renderNotes() {
        notesList.innerHTML = '';
        Object.entries(notes).forEach(([id, note]) => {
            const noteElement = document.createElement('li');
            const noteName = document.createElement('span');
            noteName.textContent = note.name;
            noteName.classList.add('note-name');
            noteName.contentEditable = true; // Rende il nome modificabile
            noteName.addEventListener('blur', () => {
                note.name = noteName.textContent.trim();
                renderNotes();
            });

            const deleteButton = document.createElement('button');
            deleteButton.innerHTML = '<i class="ri-delete-bin-line"></i>';
            deleteButton.classList.add('delete-note');
            deleteButton.addEventListener('click', (e) => {
                e.stopPropagation(); // Evita che la selezione venga cambiata cliccando su "Cancella"
                delete notes[id];
                renderNotes();
                if (currentNoteId === id) {
                    editor.setValue('');
                    currentNoteId = null;
                }
            });

            noteElement.appendChild(noteName);
            noteElement.appendChild(deleteButton);
            noteElement.dataset.id = id;
            noteElement.addEventListener('click', () => {
                saveCurrentNote();
                selectNote(id);
            });
            notesList.appendChild(noteElement);
        });
    }

    // Seleziona una nota
    function selectNote(noteId) {
        currentNoteId = noteId;
        const note = notes[noteId];
        editor.setValue(note.content);
        loadLanguage(note.language); // Cambia il linguaggio
    }

    // Salva la nota attualmente selezionata
    function saveCurrentNote() {
        if (currentNoteId) {
            notes[currentNoteId].content = editor.getValue();
        }
    }

    // Cambia linguaggio
    document.getElementById('language-selector').addEventListener('change', (e) => {
        const language = e.target.value;
        console.log(`Linguaggio selezionato: ${language}`); // Log del linguaggio selezionato
        if (currentNoteId) {
            notes[currentNoteId].language = language; // Aggiorna il linguaggio della nota corrente
            editor.updateOptions({ language }); // Cambia il linguaggio dell'editor
            editor.setValue(notes[currentNoteId].content); // Ricarica il contenuto per applicare il nuovo linguaggio
        } else {
            editor.updateOptions({ language }); // Cambia il linguaggio dell'editor
        }
    });

    renderNotes(); // Mostra l'elenco delle note all'avvio
});