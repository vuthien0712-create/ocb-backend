const express = require('express');
const { Pool } = require('pg'); 
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai'); 

const app = express();
app.use(cors());
app.use(express.json());

// 1. KẾT NỐI VỚI CLOUD DATABASE CỦA BẠN (NEON)
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_azIMy9cjL0Xk@ep-proud-credit-ao87kf7x-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require', // <-- DÁN CHUỖI KẾT NỐI NEON VÀO ĐÂY
  ssl: { rejectUnauthorized: false } 
});

// 2. KẾT NỐI VỚI GOOGLE GEMINI
const genAI = new GoogleGenerativeAI('AQ.Ab8RN6JJRDyQaYFEc7IH5eLh7HIlb5R3HWAhc5bs0imGugZg8w'); // <-- DÁN API KEY VÀO ĐÂY

app.get('/api/taichinh/:ma_tctd', async (req, res) => {
    const maTCTD = req.params.ma_tctd; 
    try {
        const query = `SELECT t.Ten_To_Chuc, t.Giay_Phep, t.Noi_Dung_Hoat_Dong, c.Ky_Bao_Cao, c.Von_Dieu_Le, c.Tong_Tai_San, c.Loi_Nhuan_Sau_Thue FROM TCTD t JOIN TAI_CHINH c ON t.Ma_TCTD = c.Ma_TCTD WHERE t.Ma_TCTD = $1 ORDER BY c.Ky_Bao_Cao DESC LIMIT 1;`;
        const result = await pool.query(query, [maTCTD]);
        res.json({ success: true, data: result.rows });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/canhbao-noxau/:ma_tctd', async (req, res) => {
    const maTCTD = req.params.ma_tctd;
    try {
        const query = `SELECT Ten_Chi_Nhanh, Ty_Le_No_Xau FROM CHI_NHANH WHERE Ma_TCTD = $1 AND Ty_Le_No_Xau >= 3.00 ORDER BY Ty_Le_No_Xau DESC;`;
        const result = await pool.query(query, [maTCTD]);
        res.json({ success: true, data: result.rows });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/nhansu/:ma_tctd', async (req, res) => {
    const maTCTD = req.params.ma_tctd;
    try {
        const query = `SELECT ld.Ma_NhanSu, ld.Ho_Ten AS Ten_Lanh_Dao, ld.Chuc_Danh, nlq.Ho_Ten AS Ten_Nguoi_Lien_Quan, nlq.Chuc_Danh AS Quan_He FROM NHAN_SU ld LEFT JOIN NHAN_SU nlq ON ld.Ma_NhanSu = nlq.Ma_NhanSu_LienQuan WHERE ld.Ma_TCTD = $1 AND ld.Phan_Loai = 'Lãnh đạo' ORDER BY ld.Ma_NhanSu;`;
        const result = await pool.query(query, [maTCTD]);
        const formattedData = result.rows.reduce((acc, row) => {
            let leader = acc.find(l => l.Ma_NhanSu === row.ma_nhansu);
            if (!leader) { leader = { Ma_NhanSu: row.ma_nhansu, Ten_Lanh_Dao: row.ten_lanh_dao, Chuc_Danh: row.chuc_danh, Nguoi_Lien_Quan: [] }; acc.push(leader); }
            if (row.ten_nguoi_lien_quan) { leader.Nguoi_Lien_Quan.push({ Ten: row.ten_nguoi_lien_quan, Quan_He: row.quan_he }); }
            return acc;
        }, []);
        res.json({ success: true, data: formattedData });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// --- API CHAT: ĐÃ ĐƯỢC TỐI ƯU HÓA GHÉP NỐI DỮ LIỆU ---
app.post('/api/chat', async (req, res) => {
    const { ma_tctd, question } = req.body;
    try {
        // Thay thế câu truy vấn dbQuery cũ trong API Chat bằng đoạn này:
const dbQuery = `
    SELECT 
        ld.Ho_Ten AS Lanh_Dao,
        ld.Chuc_Danh,
        jsonb_agg(
            jsonb_build_object('Ten', nlq.Ho_Ten, 'Quan_He', nlq.Chuc_Danh)
        ) AS Danh_Sach_Nguoi_Lien_Quan
    FROM NHAN_SU ld
    LEFT JOIN NHAN_SU nlq ON ld.Ma_NhanSu = nlq.Ma_NhanSu_LienQuan
    WHERE ld.Phan_Loai = 'Lãnh đạo'
    GROUP BY ld.Ma_NhanSu, ld.Ho_Ten, ld.Chuc_Danh
    ORDER BY ld.Ma_NhanSu;
`;
        const dbResult = await pool.query(dbQuery, [ma_tctd]);
        const bankData = dbResult.rows;

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = `
            Bạn là trợ lý ảo giám sát ngân hàng. Dưới đây là dữ liệu rút xuất từ hệ thống: ${JSON.stringify(bankData)}.
            
            YÊU CẦU QUAN TRỌNG: Khi người dùng hỏi về "Người có liên quan" của bất kỳ lãnh đạo nào, BẮT BUỘC phải liệt kê ĐẦY ĐỦ toàn bộ danh sách (bao gồm vợ/chồng, bố mẹ, anh chị em, các con và tổ chức liên quan) có trong cơ sở dữ liệu. Tuyệt đối không được tóm tắt hay chỉ liệt kê cổ đông. Trình bày dưới dạng danh sách gạch đầu dòng rõ ràng. 
            
            Câu hỏi của người dùng là: "${question}"
        `;
            

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();

        res.json({ success: true, answer: responseText });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log(`Máy chủ Backend đang chạy trên cổng ${PORT}`); });