require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.34.1/min/vs' } });
require(['vs/editor/editor.main'], function () {
    let currentNoteId = null; // ID della nota attualmente selezionata
    const notes = {}; // Oggetto per salvare le note
    const notesList = document.getElementById('notes-list');

    // Crea Monaco Editor
    const editor = monaco.editor.create(document.getElementById('editor-container'), {
        value: '',
        language: 'html', // Imposta un linguaggio di default
        theme: 'vs-dark', // Tema scuro
        automaticLayout: true
    });

    // Funzione per creare un nuovo modello per una nota
    function createNoteModel(content, language) {
        return monaco.editor.createModel(content, language);
    }
    let noteCounter = 0; // Contatore globale per le note

    // // Aggiungi nuova nota
    // document.getElementById('new-note').addEventListener('click', () => {
    //     const noteId = Date.now().toString(); // Genera un ID unico per la nota
    //     const selectedLanguage = document.getElementById('language-selector').value; // Ottieni il linguaggio selezionato

    //     // Crea una nuova nota con un modello associato
    //     notes[noteId] = {
    //         content: '',
    //         language: selectedLanguage,
    //         model: createNoteModel('', selectedLanguage) // Crea un modello vuoto con il linguaggio selezionato
    //     };

    //     renderNotes();
    //     selectNote(noteId); // Seleziona automaticamente la nuova nota
    // });
    // Aggiungi nuova nota
    document.getElementById('new-note').addEventListener('click', () => {
        const noteId = Date.now().toString(); // Genera un ID unico per la nota
        const selectedLanguage = document.getElementById('language-selector').value; // Ottieni il linguaggio selezionato

        noteCounter++; // Incrementa il contatore
        const defaultNoteName = `Code ${noteCounter}`; // Nome progressivo basato sul contatore

        // Crea una nuova nota con un modello associato
        notes[noteId] = {
            name: defaultNoteName, // Assegna il nome predefinito
            content: '',
            language: selectedLanguage,
            model: createNoteModel('', selectedLanguage) // Crea un modello vuoto con il linguaggio selezionato
        };

        renderNotes();
        selectNote(noteId); // Seleziona automaticamente la nuova nota
    });


    // Renderizza l'elenco delle note
    // function renderNotes() {
    //     notesList.innerHTML = '';
    //     Object.entries(notes).forEach(([id, note]) => {
    //         const noteElement = document.createElement('li');

    //         // Nome della nota
    //         const noteName = document.createElement('span');
    //         noteName.textContent = note.name || `Code ${Object.keys(notes).length}`;
    //         noteName.classList.add('note-name');
    //         noteName.contentEditable = true; // Rende il nome modificabile
    //         noteName.addEventListener('blur', () => {
    //             note.name = noteName.textContent.trim();
    //             renderNotes();
    //         });

    //         // Pulsante Cancella
    //         const deleteButton = document.createElement('button');
    //         deleteButton.innerHTML = '<i class="ri-delete-bin-line"></i>';
    //         deleteButton.classList.add('delete-note');
    //         deleteButton.addEventListener('click', (e) => {
    //             e.stopPropagation(); // Evita che la selezione venga cambiata cliccando su "Cancella"
    //             delete notes[id];
    //             renderNotes();
    //             if (currentNoteId === id) {
    //                 editor.setValue('');
    //                 currentNoteId = null;
    //             }
    //         });

    //         noteElement.appendChild(noteName);
    //         noteElement.appendChild(deleteButton);
    //         noteElement.dataset.id = id;

    //         // Event Listener per selezionare la nota
    //         noteElement.addEventListener('click', () => {
    //             saveCurrentNote();
    //             selectNote(id);
    //         });

    //         notesList.appendChild(noteElement);
    //     });
    // }
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
    
            // Event Listener per selezionare la nota
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
        editor.setModel(note.model); // Imposta il modello della nota selezionata
    }

    // Salva il contenuto della nota attualmente selezionata
    function saveCurrentNote() {
        if (currentNoteId) {
            const note = notes[currentNoteId];
            note.content = editor.getValue();
        }
    }

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


    renderNotes(); // Mostra l'elenco delle note all'avvio
});

// Apro il menu laterale
const btnSwitch = document.querySelector('.ri-menu-add-fill');
let txt = document.querySelector('.btn');
let sid = document.querySelector('.sidebar');
let edit = document.querySelector('.editor');

btnSwitch.addEventListener('click', () => {
    txt.classList.toggle('active');
    sid.classList.toggle('active');
    edit.classList.toggle('active');
});

const btnPrev = document.querySelector('.prev');
let previewr = document.querySelector('.preview')
btnPrev.addEventListener('click', () => {
    previewr.classList.toggle('active');

});