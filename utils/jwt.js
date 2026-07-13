const JWT_SECRET = process.env.JWT_SECRET || "anonfeed_jwt_secret_change_in_production_32chars";

export function getJwtSecret() {
    return new TextEncoder().encode(JWT_SECRET);
}
