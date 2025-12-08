import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import tensorflow as tf
import joblib  # Thư viện để lưu Scaler
from sklearn.preprocessing import MinMaxScaler
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Conv1D, MaxPooling1D, Input, Dropout
from tensorflow.keras.callbacks import EarlyStopping

# ==========================================
# 1. CẤU HÌNH & LOAD DỮ LIỆU
# ==========================================
DATA_FILE = 'flood_train_data.csv'
MODEL_FILE = 'flood_prediction_model.h5'
SCALER_FILE = 'flood_scaler.pkl'
TIME_STEPS = 24  # Nhìn lại 24 giờ quá khứ

print("📂 Đang đọc dữ liệu...")
try:
    df = pd.read_csv(DATA_FILE)
    print(f"✅ Đã load {len(df)} dòng dữ liệu.")
except FileNotFoundError:
    print("❌ Lỗi: Không tìm thấy file 'flood_train_data.csv'. Hãy chạy script gen data trước!")
    exit()

# ==========================================
# 2. TIỀN XỬ LÝ DỮ LIỆU (PREPROCESSING)
# ==========================================
print("\n🛠️ Đang xử lý dữ liệu...")

# 2.1 Chuẩn hóa (Scaling) về [0, 1]
# Rất quan trọng với LSTM để model hội tụ nhanh
scaler = MinMaxScaler()
# Chúng ta fit trên cả 2 cột (pcpn, height)
data_scaled = scaler.fit_transform(df[['pcpn', 'height']].values)

# 2.2 Hàm tạo Sliding Window
def create_sequences(data, time_steps=24):
    X, y = [], []
    for i in range(len(data) - time_steps):
        # Input (X): Lấy cửa sổ 24 giờ (gồm cả mưa và nước)
        # Shape của 1 mẫu X: (24, 2)
        X.append(data[i:(i + time_steps)])
        
        # Output (y): Lấy mực nước (cột index 1) của giờ tiếp theo
        y.append(data[i + time_steps, 1]) 
        
    return np.array(X), np.array(y)

# 2.3 Tạo tập Train/Test
X, y = create_sequences(data_scaled, TIME_STEPS)

# Chia theo thời gian (80% đầu để train, 20% sau để test)
train_size = int(len(X) * 0.8)
X_train, X_test = X[:train_size], X[train_size:]
y_train, y_test = y[:train_size], y[train_size:]

print(f"   - Train shape: X={X_train.shape}, y={y_train.shape}")
print(f"   - Test shape:  X={X_test.shape}, y={y_test.shape}")

# ==========================================
# 3. XÂY DỰNG MODEL (CNN-LSTM)
# ==========================================
print("\n🧠 Đang xây dựng Model CNN-LSTM...")

model = Sequential([
    # Input Layer
    Input(shape=(X_train.shape[1], X_train.shape[2])), # (24, 2)

    # 1. CNN Block: Trích xuất đặc trưng ngắn hạn (vd: cơn mưa bất chợt)
    Conv1D(filters=64, kernel_size=3, activation='relu', padding='same'),
    MaxPooling1D(pool_size=2),

    # 2. LSTM Block: Học chuỗi thời gian dài hạn (vd: nước rút chậm)
    LSTM(64, return_sequences=False, activation='relu'),
    Dropout(0.2), # Chống học vẹt (overfitting)

    # 3. Output Block
    Dense(32, activation='relu'),
    Dense(1) # Dự đoán 1 giá trị (Mực nước)
])

model.compile(optimizer='adam', loss='mse', metrics=['mae'])
model.summary()

# ==========================================
# 4. HUẤN LUYỆN (TRAINING)
# ==========================================
print("\n🏋️ Bắt đầu huấn luyện...")

# Dừng sớm nếu model không cải thiện sau 5 epochs (tiết kiệm thời gian)
early_stop = EarlyStopping(monitor='val_loss', patience=5, restore_best_weights=True)

history = model.fit(
    X_train, y_train,
    epochs=20,            # Số vòng lặp tối đa
    batch_size=32,        # Số mẫu học mỗi lần
    validation_data=(X_test, y_test),
    callbacks=[early_stop],
    verbose=1
)

# ==========================================
# 5. ĐÁNH GIÁ & VISUALIZE
# ==========================================
print("\n📊 Đang vẽ biểu đồ đánh giá...")

# Dự đoán trên tập Test
y_pred_scaled = model.predict(X_test)

# Inverse Scale để về đơn vị cm thực tế
# Vì scaler train trên 2 cột, ta phải tạo mảng dummy để inverse cột y
dummy_test = np.zeros((len(y_test), 2))
dummy_test[:, 1] = y_test
y_test_actual = scaler.inverse_transform(dummy_test)[:, 1]

dummy_pred = np.zeros((len(y_pred_scaled), 2))
dummy_pred[:, 1] = y_pred_scaled.flatten()
y_pred_actual = scaler.inverse_transform(dummy_pred)[:, 1]

# Vẽ biểu đồ
plt.figure(figsize=(12, 6))
plt.plot(y_test_actual[:200], label='Thực tế (Real)', color='blue')
plt.plot(y_pred_actual[:200], label='Dự báo (Predicted)', color='red', linestyle='--')
plt.title('So sánh Mực nước Thực tế vs Dự báo (200 giờ đầu tập Test)')
plt.xlabel('Thời gian (Giờ)')
plt.ylabel('Mực nước (cm)')
plt.legend()
plt.grid(True, alpha=0.3)
plt.savefig('evaluation_chart.png')
print("✅ Đã lưu biểu đồ: evaluation_chart.png")

# ==========================================
# 6. LƯU MODEL & SCALER (QUAN TRỌNG)
# ==========================================
print("\n💾 Đang lưu trữ hệ thống...")

# 1. Lưu Model (.h5)
model.save(MODEL_FILE)
print(f"✅ Đã lưu Model: {MODEL_FILE}")

# 2. Lưu Scaler (.pkl) -> BẮT BUỘC để dùng cho API sau này
joblib.dump(scaler, SCALER_FILE)
print(f"✅ Đã lưu Scaler: {SCALER_FILE}")

print("\n🎉 HOÀN TẤT! Bạn đã có thể dùng model này cho hệ thống IoT.")