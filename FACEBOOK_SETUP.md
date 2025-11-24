# Hướng dẫn cấu hình Facebook API

## Bước 1: Tạo Facebook App

1. Truy cập [Facebook Developers](https://developers.facebook.com/)
2. Đăng nhập bằng tài khoản Facebook của bạn
3. Vào **My Apps** > **Create App**
4. Chọn loại app: **Business** hoặc **Other**
5. Điền thông tin:
   - **App Name**: Tên app của bạn (ví dụ: MayHomes Dashboard)
   - **App Contact Email**: Email liên hệ
   - **Business Account**: Chọn business account (nếu có)

## Bước 2: Thêm Facebook Marketing API

1. Trong App Dashboard, vào **Add Products**
2. Tìm và thêm **Marketing API**
3. Chấp nhận các điều khoản

## Bước 3: Lấy Access Token

### Cách 1: Lấy User Access Token (để test)

1. Vào **Tools** > **Graph API Explorer**
2. Chọn app vừa tạo ở dropdown **Meta App**
3. Chọn quyền (Permissions):
   - `ads_read` - Đọc thông tin ads
   - `ads_management` - Quản lý ads (nếu cần)
   - `business_management` - Quản lý business (nếu cần)
4. Click **Generate Access Token**
5. Copy token (token này là **Short-lived token**, chỉ dùng được 1-2 giờ)

### Cách 2: Tạo Long-lived Token (khuyến nghị)

1. Sau khi có Short-lived token, vào **Tools** > **Access Token Tool**
2. Chọn app và nhập Short-lived token
3. Click **Extend Access Token** để tạo Long-lived token
4. Long-lived token có thể dùng được 60 ngày

### Cách 3: Tạo System User Token (cho production)

1. Vào **Business Settings** > **System Users**
2. Tạo System User mới
3. Assign quyền cho System User:
   - Ads Management
   - Business Management
4. Generate token cho System User
5. Token này không bao giờ hết hạn (trừ khi bị revoke)

## Bước 4: Lấy Ad Account ID

1. Vào [Facebook Ads Manager](https://business.facebook.com/adsmanager/)
2. Vào **Account Settings** > **Account Info**
3. Tìm **Ad Account ID** (format: `act_123456789`)
4. Hoặc vào **Business Settings** > **Ad Accounts** để xem danh sách

## Bước 5: Cấu hình vào file .env

Tạo file `.env` từ `env.example` và điền thông tin:

```env
# Facebook Graph API Configuration
FACEBOOK_ACCESS_TOKEN=EAAxxxxxxxxxxxxx  # Token bạn vừa lấy
FACEBOOK_AD_ACCOUNT_ID=act_123456789    # Ad Account ID của bạn

# Optional: Để refresh token nếu cần
FACEBOOK_APP_ID=your_app_id
FACEBOOK_APP_SECRET=your_app_secret
```

## Bước 6: Lấy App ID và App Secret (nếu cần refresh token)

1. Vào **App Dashboard** > **Settings** > **Basic**
2. Copy **App ID** và **App Secret**
3. Thêm vào file `.env`:
   ```env
   FACEBOOK_APP_ID=your_app_id
   FACEBOOK_APP_SECRET=your_app_secret
   ```

## Lưu ý quan trọng:

1. **Access Token**:
   - Short-lived token: Hết hạn sau 1-2 giờ
   - Long-lived token: Hết hạn sau 60 ngày
   - System User token: Không hết hạn (khuyến nghị cho production)

2. **Quyền cần thiết**:
   - `ads_read`: Đọc thông tin ads và insights
   - `ads_management`: Quản lý ads (nếu cần chỉnh sửa)
   - `business_management`: Quản lý business account

3. **App Review**:
   - Để sử dụng trong production, bạn cần submit app để Facebook review
   - Trong development mode, chỉ có thể test với tài khoản admin của app

4. **Rate Limits**:
   - Facebook API có giới hạn số request mỗi giờ
   - Nếu vượt quá, sẽ bị rate limit

## Kiểm tra cấu hình:

Sau khi cấu hình xong, khởi động lại ứng dụng và kiểm tra logs:

```bash
npm run start:dev
```

Nếu thấy log: `Fetched X tracking items from Facebook` thì đã cấu hình thành công!

## Troubleshooting:

1. **Lỗi "Invalid Access Token"**:
   - Kiểm tra token có còn hiệu lực không
   - Đảm bảo token có đủ quyền `ads_read`

2. **Lỗi "Invalid Ad Account ID"**:
   - Kiểm tra format: phải bắt đầu bằng `act_`
   - Đảm bảo token có quyền truy cập ad account đó

3. **Lỗi "Rate Limit Exceeded"**:
   - Giảm số lượng request
   - Đợi một lúc rồi thử lại

## Tài liệu tham khảo:

- [Facebook Marketing API Documentation](https://developers.facebook.com/docs/marketing-apis)
- [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
- [Access Token Tool](https://developers.facebook.com/tools/accesstoken/)

