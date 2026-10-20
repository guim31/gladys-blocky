# Blocky

Suivez et pilotez votre proxy DNS et bloqueur de publicités
[Blocky](https://0xerr0r.github.io/blocky/) depuis Gladys, sur votre réseau
local : mettez son blocage en pause cinq minutes depuis le tableau de bord
quand un site ne marche plus, mettez en pause seulement certains groupes de
listes depuis une scène, rafraîchissez les listes, voyez ses requêtes de la
dernière heure, et soyez prévenu quand il ne répond plus.

> **Testée avec un vrai Blocky v0.35** (l'image Docker officielle), pas encore
> avec une vraie installation de Gladys : vos retours sont les bienvenus. Si
> quelque chose ne marche pas comme décrit, dites-le sur le
> [forum Gladys](https://community.gladysassistant.com) ou dans les
> [issues](https://github.com/guim31/gladys-blocky/issues).

## Ce qu'il faut

- Gladys Assistant 5.1.0 ou plus récent (5.2.0 ou plus pour le bouton
  _Pause…_ du widget).
- **Blocky** avec son port HTTP ouvert à Gladys (`ports: http: 4000` dans
  `config.yml`). L'API REST de Blocky n'a pas de mot de passe : Gladys s'y
  adresse directement, comme la commande `blocky`.
- Pour les statistiques, le point **Prometheus** de Blocky activé :

```yaml
prometheus:
  enable: true
```

Sans lui, l'appareil n'a que l'interrupteur de blocage, et le widget que l'état
et les boutons.

## Configuration

1. Installez l'intégration depuis le catalogue de Gladys.
2. Dans **Configuration**, saisissez l'**Adresse** de votre serveur (par
   exemple `192.168.1.2` : le port 4000 est ajouté ; ou une adresse complète
   comme `http://192.168.1.2:4000` ou `https://dns.example.net`), et si vous
   le souhaitez un **Nom**. Deux ou trois serveurs ? Remplissez aussi les
   sections _Deuxième serveur_ et _Troisième serveur_.
3. Enregistrez, puis cliquez sur **Tester la connexion** : le message sous le
   bouton indique, pour chaque serveur, s'il répond, sa version, l'état de son
   blocage et si les statistiques sont actives.
4. Ouvrez l'onglet **Découverte** : un appareil par serveur. Cliquez sur
   **Ajouter**, choisissez une pièce, enregistrez.

Options :

- **Accepter les certificats auto-signés** : pour une adresse en `https://`
  (le port HTTPS de Blocky) dont le certificat est auto-signé. Laissez-la
  décochée pour les adresses en `http://`.
- **Intervalle de rafraîchissement** : fréquence de lecture des serveurs, de
  30 secondes (par défaut) à 5 minutes.
- **Éteindre l'interrupteur de blocage** : ce que fait l'interrupteur de
  l'appareil quand vous l'éteignez : mettre le blocage en pause 5 minutes (par
  défaut), 15, 30 ou 60 minutes, ou le désactiver jusqu'à ce que vous le
  rallumiez.
- **Langue des noms de fonctionnalités** : anglais, français, allemand ou
  espagnol. Les noms sont donnés à l'ajout d'un appareil (français par défaut).

## L'appareil de chaque serveur

| Fonctionnalité                     | Ce que c'est                                                                             |
| ---------------------------------- | ---------------------------------------------------------------------------------------- |
| Blocage                            | Interrupteur : allumé, Blocky bloque les domaines listés ; éteint, il laisse tout passer |
| Requêtes DNS (dernière heure)      | Requêtes reçues sur les 60 dernières minutes                                             |
| Requêtes bloquées (dernière heure) | Requêtes bloquées sur les 60 dernières minutes                                           |
| Part bloquée (dernière heure)      | Part des requêtes bloquées, en %, arrondie                                               |
| Taux de cache (dernière heure)     | Part des requêtes envoyées en amont auxquelles le cache a répondu, en %, arrondie        |
| Domaines bloqués                   | Entrées des listes de blocage, tous groupes confondus                                    |
| Version                            | La version installée de Blocky                                                           |

Toutes les fonctionnalités sauf _Blocage_ viennent du point Prometheus. Blocky
compte depuis son démarrage ; l'intégration calcule la dernière heure à partir
de deux lectures espacées d'une heure. Juste après le démarrage de Gladys, de
l'intégration ou de Blocky, les chiffres apparaissent à la deuxième lecture et
couvrent une durée plus courte, jusqu'à une heure. Activer ou désactiver
Prometheus ajoute ou retire ces fonctionnalités : Gladys propose alors de
**Mettre à jour** l'appareil dans l'onglet Découverte.

L'interrupteur passe à **éteint** dès que Blocky annonce son blocage désactivé,
y compris quand seuls certains groupes sont en pause. Quand une pause a une
durée, Blocky rallume lui-même le blocage à la fin, et l'interrupteur suit. Le
badge de l'appareil indique **Local** quand le serveur répond et
**Injoignable** sinon.

## Tableau de bord

Ajoutez le widget **Blocky** à un tableau de bord. Par défaut, il montre tous
vos serveurs ensemble ; choisissez-en un dans ses réglages pour ne montrer que
celui-là. Mettre en pause un seul serveur sur deux ne change rien : vos
appareils interrogent alors l'autre.

Le widget affiche les requêtes, les requêtes bloquées et la part bloquée sur
la dernière heure, l'état de chaque serveur (blocage actif, en pause avec les
minutes restantes, désactivé, injoignable), les groupes d'une pause qui ne les
couvre pas tous, le taux de cache et les domaines bloqués. Ses boutons :

- **Pause 5 min** et **Pause 30 min** : mettent tout le blocage en pause tout
  de suite ;
- **Pause…** : ouvre un petit formulaire pour saisir la durée en minutes
  (Gladys 5.2.0 ou plus ; un Gladys plus ancien répond qu'il faut le mettre à
  jour) ;
- **Réactiver** : rallume le blocage. Il porte une coche tant que le blocage
  est actif partout.

## Scènes

### Déclencheurs

- **Blocage Blocky mis en pause** : le blocage a été désactivé, depuis Gladys
  ou ailleurs (la commande `blocky`, un autre outil). Filtre par serveur et par
  origine (_Depuis Gladys_ ou _Hors de Gladys_). Les actions peuvent lire le
  nom du serveur, la durée de la pause en minutes (`duration_minutes`, 0 quand
  elle n'a pas de fin) et les groupes en pause (`groups` ; une pause de tout le
  blocage liste tous les groupes, plus `default`).
- **Blocage Blocky réactivé** : le blocage est de nouveau actif. L'origine dit
  si la pause s'est terminée d'elle-même (_Fin de la pause_), depuis Gladys ou
  ailleurs ; `paused_minutes` dit combien de temps elle a duré.
- **Blocky ne répond plus** : un serveur n'a pas répondu à deux lectures de
  suite (la seconde 15 secondes après la première). Le DNS de la maison est
  peut-être en panne. `error` dit pourquoi, dans la langue de la
  configuration.
- **Blocky répond de nouveau** : il est de retour ; `down_minutes` dit au bout
  de combien de temps.

### Actions

- **Mettre le blocage Blocky en pause** : met le blocage en pause sur un
  serveur, ou sur tous quand le champ est laissé vide, pour un nombre de
  minutes (5 par défaut, 0 jusqu'à réactivation, une journée au plus).
  **Groupes** : laissez vide pour mettre tout le blocage en pause, ou saisissez
  des noms de groupes de vos `denylists`, séparés par des virgules (par exemple
  `ads`), pour ne mettre en pause que ceux-là. Une nouvelle pause remplace
  celle en cours. Les actions suivantes peuvent lire combien de serveurs ont
  été mis en pause.
- **Réactiver le blocage Blocky** : rallume le blocage, sur un serveur ou sur
  tous.
- **Rafraîchir les listes Blocky** : télécharge de nouveau les listes de
  blocage et d'autorisation, par exemple après la modification d'un fichier de
  liste.
- **Vider le cache DNS de Blocky** : vide le cache DNS, par exemple après la
  modification d'un enregistrement, pour que les requêtes suivantes obtiennent
  une réponse fraîche.
- **Lire les statistiques Blocky** : lit les requêtes de la dernière heure en
  une phrase, comme « Sur la dernière heure, 1 234 requêtes DNS, dont 123
  bloquées (10 %). », dans la langue de la configuration. Les actions suivantes
  peuvent l'envoyer (`sentence`) ou utiliser les chiffres
  (`queries_last_hour`, `blocked_last_hour`, `blocked_percent`,
  `blocking_enabled`). Demande le point Prometheus.

L'interrupteur _Blocage_ s'utilise aussi avec l'action standard de Gladys qui
contrôle un appareil.

### Idées de scènes

- **Heure du jeu** : chaque mercredi à 14 h, _Mettre le blocage Blocky en
  pause_ pour 120 minutes avec le groupe `games` : les sites de jeux s'ouvrent
  deux heures, les publicités restent bloquées, et le blocage revient tout
  seul.
- **Alerte DNS** : _Blocky ne répond plus_ → envoyer un message « Blocky
  {{triggerEvent.data.server}} ne répond pas : {{triggerEvent.data.error}} ».
  Et _Blocky répond de nouveau_ → « de retour après
  {{triggerEvent.data.down_minutes}} min ».
- **Filet de sécurité** : une scène chaque soir à 20 h avec _Réactiver le
  blocage Blocky_, pour qu'un interrupteur éteint « jusqu'à réactivation » ne
  reste jamais éteint toute la nuit.

## Dépannage

- **« pas d'API Blocky à cette adresse »** : autre chose répond là, ou le port
  est celui du DNS. Saisissez le port HTTP de Blocky (`ports: http:` dans
  `config.yml`, souvent 4000) : `192.168.1.2`, ou `http://192.168.1.2:4000`.
- **« groupe inconnu »** : le champ _Groupes_ de la pause nomme un groupe qui
  n'est pas dans les `denylists` de `config.yml` (les majuscules comptent).
- **Pas de statistiques** : activez `prometheus: enable: true` dans
  `config.yml`, puis redémarrez Blocky. _Tester la connexion_ indique
  « statistiques actives » quand c'est bon.
- **« certificat refusé »** : vous avez saisi une adresse en `https://` ;
  cochez _Accepter les certificats auto-signés_, ou utilisez l'adresse en
  `http://`.
- **« l'adresse redirige »** : saisissez l'adresse en `https://`.
- **« un mot de passe protège cette adresse »** : un proxy inverse avec
  connexion se trouve devant Blocky ; donnez plutôt à Gladys l'adresse directe
  de Blocky.
- **« ne répond pas »** : vérifiez que
  `http://<adresse>:4000/api/blocking/status` s'ouvre depuis un ordinateur du
  réseau de Gladys. Les noms en `.local` ne marchent en général pas dans
  l'intégration : utilisez l'adresse IP.
- Logs : sur la page de l'intégration dans Gladys, ou `docker logs` sur l'hôte.
  Ils montrent le démarrage, chaque serveur perdu et retrouvé, les problèmes
  (une fois chacun, pas à chaque lecture) et vos commandes. Lancez le conteneur
  avec `LOG_LEVEL=debug` pour voir chaque lecture et chaque nouvel essai.

## Limites

- Une intégration gère jusqu'à trois serveurs. Les instances de Blocky qui
  partagent leur état par Redis se mettent en pause ensemble : en mettre une en
  pause suffit.
- L'intégration lit chaque serveur une fois par intervalle de rafraîchissement
  (deux petites requêtes : l'état du blocage et la page Prometheus) : aucun
  quota n'est en jeu.
- Les chiffres ne portent que sur la dernière heure ; Gladys en garde
  l'historique.
- Les parts sont arrondies dans l'appareil (Gladys n'a pas de capteur de
  pourcentage décimal) ; le widget montre une décimale pour la part bloquée.
- L'intégration ne modifie ni les listes, ni les groupes de clients, ni la
  configuration de Blocky : utilisez `config.yml` pour cela.

Cette intégration n'est pas affiliée à Blocky ni à ses auteurs.
