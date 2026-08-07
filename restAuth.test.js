import { describe, it, expect, vi } from 'vitest';
const { bearerTokenAl, jwtDogrulaMiddleware } = require('./restAuth.js');

function sahteReqResOlustur(authorization) {
    return {
        req: { headers: authorization ? { authorization } : {} },
        res: { status: vi.fn().mockReturnThis(), json: vi.fn() },
        next: vi.fn()
    };
}

describe('bearerTokenAl', () => {
    it('Bearer basligindan tokeni cikarir', () => {
        expect(bearerTokenAl({ headers: { authorization: 'Bearer abc.def.ghi' } })).toBe('abc.def.ghi');
    });

    it('Bearer disi baslik veya baslik yoksa null doner', () => {
        expect(bearerTokenAl({ headers: {} })).toBeNull();
        expect(bearerTokenAl({ headers: { authorization: 'Basic xyz' } })).toBeNull();
    });
});

describe('jwtDogrulaMiddleware', () => {
    it('gecerli token ve izinli rol ile next cagirir, req.kullanici i doldurur', () => {
        const tokenDogrula = vi.fn().mockReturnValue({ id: 1, rol: 'kaptan' });
        const middleware = jwtDogrulaMiddleware(tokenDogrula, 'gizli', ['kaptan', 'admin']);
        const { req, res, next } = sahteReqResOlustur('Bearer gecerli-token');

        middleware(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(req.kullanici).toEqual({ id: 1, rol: 'kaptan' });
    });

    it('token yoksa veya gecersizse 401 doner', () => {
        const tokenDogrula = vi.fn().mockReturnValue(null);
        const middleware = jwtDogrulaMiddleware(tokenDogrula, 'gizli', ['kaptan']);
        const { req, res, next } = sahteReqResOlustur(undefined);

        middleware(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('rol izinli roller listesinde degilse 403 doner', () => {
        const tokenDogrula = vi.fn().mockReturnValue({ id: 1, rol: 'personel' });
        const middleware = jwtDogrulaMiddleware(tokenDogrula, 'gizli', ['kaptan', 'admin']);
        const { req, res, next } = sahteReqResOlustur('Bearer gecerli-token');

        middleware(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });
});
