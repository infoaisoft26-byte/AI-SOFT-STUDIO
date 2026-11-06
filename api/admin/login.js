import adminLogin from "../_handlers/admin-login.js";

export default function handler(req, res) {
  return adminLogin(req, res);
}
