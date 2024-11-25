function isInStandaloneMode() {
    return (window.matchMedia('(display-mode: standalone)').matches) || (window.navigator.standalone);
}

// Funzione per rilevare il sistema operativo
function detectMobileOperatingSystem() {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;

    // Controlla se è un dispositivo iOS
    if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
        return 'iOS';
    }

    // Controlla se è un dispositivo Android
    if (/android/i.test(userAgent)) {
        return 'Android';
    }

    return 'unknown';
}

let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;

    // Mostra il pulsante per Android solo se l'app non è già in modalità standalone
    if (!isInStandaloneMode()) {
        document.getElementById('add-to-home-button').style.display = 'flex';
    }
});

window.addEventListener('load', () => {
    if (isInStandaloneMode()) {
        
        //alert("L'app è già stata aggiunta alla schermata iniziale.");
        // Nascondi entrambi i pulsanti (iOS e Android) se l'app è già in modalità standalone
        document.getElementById('login-btn3').style.display = 'none';
        document.getElementById('add-to-home-button').style.display = 'none';
        document.getElementById('default').style.display = 'none';
    } else {
       
        //alert("L'app non è stata ancora aggiunta alla schermata iniziale.");
        // Mostra il pulsante appropriato in base al sistema operativo
        const os = detectMobileOperatingSystem();

        if (os === 'iOS') {
            document.getElementById('login-btn3').style.display = 'flex';
        } else if (os === 'Android') {
            document.getElementById('add-to-home-button').style.display = 'flex';
        }else{
            document.getElementById('default').style.display = 'flex';
        }
    }
});

// Event listener per il pulsante Android
document.getElementById('add-to-home-button').addEventListener('click', () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
              
                //alert("Utente ha accettato l\'aggiunta alla schermata iniziale");
            } else {
                
                //alert("Utente ha rifiutato l\'aggiunta alla schermata iniziale");
            }
            deferredPrompt = null;
        });
    }
});

const loginBtn2i = document.getElementById("login-btn3");
const formCon2i = document.querySelector(".WrapperSalvaIcon");
const formClose2i = document.getElementById("form-close3");
loginBtn2i.addEventListener("click", showForm2i);
formClose2i.addEventListener("click", hiddenForm2i);

function showForm2i() {
  formCon2i.style.top = "0px";
}

function hiddenForm2i() {
  formCon2i.style.top = null;
}

