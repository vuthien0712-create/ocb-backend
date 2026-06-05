const express = require('express');
const { Pool } = require('pg'); 
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// 1. KẾT NỐI VỚI CLOUD DATABASE CỦA BẠN (NEON)
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_azIMy9cjL0Xk@ep-proud-credit-ao87kf7x-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require', // <-- BẠN HÃY XÓA DÒNG CHỮ NÀY VÀ DÁN CHUỖI KẾT NỐI NEON VÀO ĐÂY (Giữ lại 2 dấu nháy đơn)
  ssl: { rejectUnauthorized: false } 
});

// 2. API: Lấy thông tin cơ bản & Tài chính của một Ngân hàng (Lọc theo Ma_TCTD)
app.get('/api/taichinh/:ma_tctd', async (req, res) => {
    const maTCTD = req.params.ma_tctd; 
    
    try {
        const query = `
            SELECT t.Ten_To_Chuc, t.Giay_Phep, c.Ky_Bao_Cao, c.Von_Dieu_Le, c.Tong_Tai_San, c.Loi_Nhuan_Sau_Thue 
            FROM TCTD t
            JOIN TAI_CHINH c ON t.Ma_TCTD = c.Ma_TCTD
            WHERE t.Ma_TCTD = $1
            ORDER BY c.Ky_Bao_Cao DESC LIMIT 1;
        `;
        const result = await pool.query(query, [maTCTD]);

        if (result.rows.length > 0) {
            res.json({ success: true, data: result.rows });
        } else {
            res.status(404).json({ success: false, message: "Không tìm thấy dữ liệu ngân hàng này" });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3. API: Lấy danh sách Chi nhánh rủi ro (Nợ xấu > 3%) của một Ngân hàng
app.get('/api/canhbao-noxau/:ma_tctd', async (req, res) => {
    const maTCTD = req.params.ma_tctd;
    
    try {
        const query = `
            SELECT Ten_Chi_Nhanh, Ty_Le_No_Xau 
            FROM CHI_NHANH 
            WHERE Ma_TCTD = $1 AND Ty_Le_No_Xau >= 3.00
            ORDER BY Ty_Le_No_Xau DESC;
        `;
        const result = await pool.query(query, [maTCTD]);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Khởi động máy chủ trên Cloud
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Máy chủ Backend đang chạy trên cổng ${PORT}`);
});