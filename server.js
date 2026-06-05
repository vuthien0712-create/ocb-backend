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

// 2. API: Lấy Tài chính
app.get('/api/taichinh/:ma_tctd', async (req, res) => {
    const maTCTD = req.params.ma_tctd; 
    try {
        const query = `
            SELECT t.Ten_To_Chuc, t.Giay_Phep, c.Ky_Bao_Cao, c.Von_Dieu_Le, c.Tong_Tai_San, c.Loi_Nhuan_Sau_Thue 
            FROM TCTD t JOIN TAI_CHINH c ON t.Ma_TCTD = c.Ma_TCTD
            WHERE t.Ma_TCTD = $1 ORDER BY c.Ky_Bao_Cao DESC LIMIT 1;
        `;
        const result = await pool.query(query, [maTCTD]);
        res.json({ success: true, data: result.rows });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// 3. API: Cảnh báo Nợ xấu
app.get('/api/canhbao-noxau/:ma_tctd', async (req, res) => {
    const maTCTD = req.params.ma_tctd;
    try {
        const query = `SELECT Ten_Chi_Nhanh, Ty_Le_No_Xau FROM CHI_NHANH WHERE Ma_TCTD = $1 AND Ty_Le_No_Xau >= 3.00 ORDER BY Ty_Le_No_Xau DESC;`;
        const result = await pool.query(query, [maTCTD]);
        res.json({ success: true, data: result.rows });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// 4. API MỚI: Lấy danh sách Lãnh đạo và Người liên quan
app.get('/api/nhansu/:ma_tctd', async (req, res) => {
    const maTCTD = req.params.ma_tctd;
    try {
        // Truy vấn Lãnh đạo và dùng LEFT JOIN để kéo người liên quan lên cùng
        const query = `
            SELECT 
                ld.Ma_NhanSu, ld.Ho_Ten AS Ten_Lanh_Dao, ld.Chuc_Danh,
                nlq.Ho_Ten AS Ten_Nguoi_Lien_Quan, nlq.Chuc_Danh AS Quan_He
            FROM NHAN_SU ld
            LEFT JOIN NHAN_SU nlq ON ld.Ma_NhanSu = nlq.Ma_NhanSu_LienQuan
            WHERE ld.Ma_TCTD = $1 AND ld.Phan_Loai = 'Lãnh đạo'
            ORDER BY ld.Ma_NhanSu;
        `;
        const result = await pool.query(query, [maTCTD]);

        // Gom nhóm người liên quan vào dưới tên từng lãnh đạo
        const formattedData = result.rows.reduce((acc, row) => {
            let leader = acc.find(l => l.Ma_NhanSu === row.ma_nhansu);
            if (!leader) {
                leader = { Ma_NhanSu: row.ma_nhansu, Ten_Lanh_Dao: row.ten_lanh_dao, Chuc_Danh: row.chuc_danh, Nguoi_Lien_Quan: [] };
                acc.push(leader);
            }
            if (row.ten_nguoi_lien_quan) {
                leader.Nguoi_Lien_Quan.push({ Ten: row.ten_nguoi_lien_quan, Quan_He: row.quan_he });
            }
            return acc;
        }, []);

        res.json({ success: true, data: formattedData });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log(`Máy chủ Backend đang chạy trên cổng ${PORT}`); });