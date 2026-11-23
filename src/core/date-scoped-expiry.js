// Cache l'expiration des effets physiques tant que le monde et la date restent identiques.
// Le moteur met à jour le monde de façon immuable : un nouvel objet invalide le cache.
export function createDateScopedExpiry(expire) {
  let previousWorld = null;
  let previousDate = null;
  return (world, date) => {
    if (world === previousWorld && date === previousDate) return world;
    const nextWorld = expire(world, date);
    previousWorld = nextWorld;
    previousDate = date;
    return nextWorld;
  };
}
