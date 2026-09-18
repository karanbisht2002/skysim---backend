import axios from "axios";

export const appleApi = (jwt: string) => {
    const api = axios.create({
        baseURL: "https://api.appstoreconnect.apple.com",
        headers: {
            Authorization: `Bearer ${jwt}`,
            "Content-Type": "application/json",
        },
    });

    // 🔍 Request logger
    api.interceptors.request.use(req => {
        console.log("🍎 APPLE REQUEST");
        console.log("➡️", req.method?.toUpperCase(), req.url);
        console.log("📤", JSON.stringify(req.data, null, 2));
        return req;
    });

    // 🔥 Response + error logger
    api.interceptors.response.use(
        res => {
            console.log("✅ APPLE RESPONSE", res.status);
            console.log("📥", JSON.stringify(res.data, null, 2));
            return res;
        },
        err => {
            console.error("❌ APPLE ERROR");
            console.error("Status:", err.response?.status);
            console.error(
                "Body:",
                JSON.stringify(err.response?.data, null, 2)
            );
            throw err;
        }
    );

    return api;
};

