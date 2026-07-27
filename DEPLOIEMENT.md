# 🎮 Undercover & co — mettre le jeu en ligne

Plateforme de jeux multijoueur en temps réel (7 jeux : Undercover, Time Bomb,
Bomb Party, Échelle, Fusion, Word Scatter, Pinturillo). Projet perso, indépendant.

## Jouer tout de suite (même Wi-Fi)

```bash
npm install
npm start
```

Le serveur affiche une adresse réseau du type `http://192.168.1.154:3000` :
tes amis sur le **même Wi-Fi** la tapent sur leur téléphone/PC et jouent. ✅

## Jouer en ligne (partout) — gratuit, ~5 min

⚠️ Vercel ne convient PAS (pas de WebSocket permanent). Utilise un hébergeur **Node**.

### Option A — Render (le plus simple)

1. Mets ce dossier sur **GitHub** (dépôt public ou privé).
2. Va sur **https://render.com** → connecte-toi avec GitHub.
3. **New +** → **Web Service** → choisis ton dépôt.
   - Render détecte Node tout seul. Sinon : Build = `npm install`, Start = `node server.js`.
   - Plan : **Free**.
4. Clique **Deploy**. Au bout d'1–2 min, tu obtiens une URL
   `https://ton-jeu.onrender.com`. Partage-la à tes potes → ils jouent depuis chez eux. 🎉

> Astuce : le fichier `render.yaml` permet aussi un déploiement en 1 clic
> (New + → **Blueprint** → ton dépôt).

*Gratuit = le serveur « s'endort » après 15 min sans joueur et se réveille en
~30 s au premier qui se connecte. Pour du sans-coupure : ~5 €/mois.*

### Option B — Railway / Fly.io

- **Railway** (railway.app) : New Project → Deploy from GitHub → détecte Node.
- **Fly.io** : `fly launch` (il utilise le `Dockerfile`), puis `fly deploy`.

## Notes

- Le port est fourni par l'hébergeur (variable `PORT`) — déjà géré.
- Le WebSocket passe en `wss://` automatiquement en HTTPS — déjà géré.
- Les parties vivent en mémoire : un redémarrage de l'hébergeur les efface
  (les joueurs recréent un salon). C'est voulu pour rester simple et sans base.
