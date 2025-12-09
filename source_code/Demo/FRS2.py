import numpy as np
import matplotlib.pyplot as plt
import networkx as nx
import joblib
import os
from tensorflow.keras.models import load_model
from sklearn.preprocessing import MinMaxScaler

# ======================================================
# 1. CẤU HÌNH ĐỒ THỊ (KHU VỰC AO SEN - VĂN QUÁN)
# ======================================================

# Danh sách cạnh (Topology)
edges_list = [
    # --- Trục Dọc Bên Trái (Văn Quán) ---
    ('Ga Văn Quán', 'P. Vũ Trọng Khánh'),
    ('Ga Văn Quán', 'Nguyễn Khuyến'),
    ('P. Vũ Trọng Khánh', 'Nguyễn Khuyến'),
    ('Nguyễn Khuyến', 'Ngõ 25'),
    ('Ngõ 25', 'Hồ Văn Quán'),
    
    # --- Đường Ngang Phía Trên (Ngõ Tắt) ---
    ('P. Vũ Trọng Khánh', 'Ngõ 4 B'),
    ('Ngõ 4 B', 'Ngõ 4 A'),
    ('Ngõ 4 A', 'P. Nguyễn Văn Trỗi'),
    ('P. Vũ Trọng Khánh', 'P. Nguyễn Văn Trỗi'),
    
    # --- Trục Giữa (Trần Phú & Kiến Trúc) ---
    ('P. Nguyễn Văn Trỗi', 'PTIT'),
    ('PTIT', 'Ngõ 92 Trần Phú'),
    ('Nguyễn Khuyến', 'Media Mart'),
    ('Media Mart', 'ĐH Kiến trúc'),
    ('ĐH Kiến trúc', 'Ngã tư Coopmart'), 
    
    # --- Khu Vực Ao Sen (Điểm Nóng) ---
    ('Ngõ 92 Trần Phú', 'Ngõ Ao Sen'),
    ('Ngõ Ao Sen', 'Ngã tư Coopmart'),
    
    # Các ngõ sâu bên trong (Đường tránh)
    ('Ngõ 92 Trần Phú', 'Ngõ 3 Ao Sen A'),
    ('Ngõ 3 Ao Sen A', 'Cuối Ao Sen 1'),
    ('Ngõ 3 Ao Sen A', 'Ngõ 3 Ao Sen B'),
    ('Ngõ 3 Ao Sen B', 'Cuối Ao Sen 2'),
    ('Ngõ 3 Ao Sen B', 'Ngõ Ao Sen'),
    ('Cuối Ao Sen 2', 'Ngõ 58 Ao Sen'),
    ('Ngõ 58 Ao Sen', 'Ngã tư Coopmart')
]

# Tọa độ hiển thị (Layout)
custom_pos = {
    'Ga Văn Quán': (0, 3),
    'Ngõ 4 B': (2, 5), 'P. Vũ Trọng Khánh': (2, 3), 'Nguyễn Khuyến': (2, 2), 'Ngõ 25': (2, 1), 'Hồ Văn Quán': (3, 0),
    'Ngõ 4 A': (3, 5), 'P. Nguyễn Văn Trỗi': (3, 3), 'Media Mart': (3, 2),
    'PTIT': (4, 3), 'ĐH Kiến trúc': (4, 2),
    'Ngõ 92 Trần Phú': (5, 3),
    'Cuối Ao Sen 1': (5.5, 5), 'Ngõ 3 Ao Sen A': (5.5, 4),
    'Ngõ 3 Ao Sen B': (6.5, 4), 'Cuối Ao Sen 2': (6.5, 5), 'Ngõ Ao Sen': (6, 3),
    'Ngõ 58 Ao Sen': (7.5, 4), 'Ngã tư Coopmart': (8, 3)
}

# ======================================================
# 2. TÍCH HỢP AI MODEL (REAL INFERENCE)
# ======================================================
print("ĐANG KHỞI TẠO HỆ THỐNG AI...")

MODEL_PATH = 'flood_prediction_model.h5'
SCALER_PATH = 'flood_scaler.pkl'
ai_model = None
scaler = None

# 1. Load Model & Scaler
if os.path.exists(MODEL_PATH) and os.path.exists(SCALER_PATH):
    try:
        ai_model = load_model(MODEL_PATH)
        scaler = joblib.load(SCALER_PATH)
        print(f"Đã load thành công Model: {MODEL_PATH}")
    except Exception as e:
        print(f"Lỗi khi load model: {e}")
else:
    print("Không tìm thấy file model/scaler. Đang chạy chế độ giả lập (Mock).")

# 2. Hàm tạo dữ liệu đầu vào giả lập (Simulated Sensor Data)
def generate_sensor_input(scenario='safe'):
    """
    Tạo ra chuỗi dữ liệu 24 giờ để đưa vào model.
    scenario: 'safe' (nắng đẹp) hoặc 'flood' (mưa bão)
    """
    if scenario == 'flood':
        # Kịch bản ngập: Mưa to (20-50mm) và nước đang dâng cao (40-80cm)
        rain = np.random.uniform(20, 50, 24)
        water = np.linspace(40, 80, 24) + np.random.normal(0, 2, 24)
    else:
        # Kịch bản an toàn: Không mưa, nước thấp (5-10cm)
        rain = np.zeros(24)
        water = np.full(24, 5) + np.random.normal(0, 1, 24)
    
    # Ghép lại thành mảng (24, 2)
    raw_data = np.stack((rain, water), axis=1)
    return raw_data

# 3. Hàm dự đoán thông minh
def get_flood_prediction(node_name):
    """
    Dùng Model AI để dự đoán mực nước tại địa điểm cụ thể.
    """
    # --- KỊCH BẢN HIỆN TRƯỜNG (DEMO SCENARIO) ---
    # Giả sử cảm biến tại các điểm này đang báo về tín hiệu mưa lớn
    flooded_zones = ['Ngõ 92 Trần Phú', 'Ngõ Ao Sen'] 
    
    scenario = 'flood' if node_name in flooded_zones else 'safe'
    
    # Nếu có model, chạy dự đoán thật
    if ai_model and scaler:
        # a. Tạo dữ liệu cảm biến giả lập
        raw_input = generate_sensor_input(scenario)
        
        # b. Chuẩn hóa dữ liệu (Dùng scaler đã train)
        input_scaled = scaler.transform(raw_input)
        
        # c. Reshape cho LSTM (1, 24, 2)
        model_input = input_scaled.reshape(1, 24, 2)
        
        # d. Dự đoán (trả về giá trị scaled)
        pred_scaled = ai_model.predict(model_input, verbose=0)
        
        # e. Inverse Transform để ra cm
        # Tạo mảng dummy vì scaler cần 2 cột để inverse
        dummy = np.zeros((1, 2))
        dummy[0, 1] = pred_scaled[0][0]
        pred_cm = scaler.inverse_transform(dummy)[0, 1]
        
        return pred_cm
    
    # Fallback nếu không có model
    return 60.0 if scenario == 'flood' else 5.0

# ======================================================
# 3. XỬ LÝ & VẼ ĐỒ THỊ
# ======================================================

def solve_routing(start_node, end_node):
    G = nx.Graph()
    
    print(f"\n--- 📡 AI ĐANG QUÉT DỮ LIỆU CẢM BIẾN TỪ {start_node} ĐẾN {end_node} ---")
    flooded_edges = []
    
    for u, v in edges_list:
        weight = 1 # Mặc định độ dài = 1
        
        # Gọi AI dự đoán cho 2 đầu mút
        lvl_u = get_flood_prediction(u)
        lvl_v = get_flood_prediction(v)
        
        # Ngưỡng ngập: 40cm
        if lvl_u > 40 or lvl_v > 40:
            weight = 9999
            flooded_edges.append((u, v))
            # Chỉ in log cho các điểm ngập để đỡ rối
            if lvl_u > 40 or lvl_v > 40:
                # print(f"⚠️  CẢNH BÁO: {u} hoặc {v} ngập sâu ({max(lvl_u, lvl_v):.1f}cm) -> Chặn đường.")
                pass
        
        G.add_edge(u, v, weight=weight)

    # Tìm đường
    try:
        path = nx.dijkstra_path(G, start_node, end_node, weight='weight')
        print(f"\nLỘ TRÌNH AI ĐỀ XUẤT: {' -> '.join(path)}")
    except:
        print(f"\nKHÔNG TÌM THẤY ĐƯỜNG ĐI!")
        path = []

    # --- VẼ ĐỒ THỊ ---
    plt.figure(figsize=(15, 9))
    pos = custom_pos 
    
    # 1. Vẽ cạnh thường
    normal_edges = [e for e in G.edges() if tuple(sorted(e)) not in [tuple(sorted(f)) for f in flooded_edges]]
    nx.draw_networkx_edges(G, pos, edgelist=normal_edges, width=2, edge_color='#bdc3c7')
    
    # 2. Vẽ cạnh ngập
    nx.draw_networkx_edges(G, pos, edgelist=flooded_edges, width=4, edge_color='#e74c3c', style='dashed')
    
    # 3. Vẽ Lộ trình
    if len(path) > 1:
        path_edges = list(zip(path, path[1:]))
        nx.draw_networkx_edges(G, pos, edgelist=path_edges, width=6, edge_color='#2ecc71', alpha=0.8)
    
    # 4. Vẽ Nút
    node_colors = []
    for n in G.nodes():
        if n == start_node: node_colors.append('#f1c40f')
        elif n == end_node: node_colors.append('#8e44ad')
        # Check lại AI một lần nữa để tô màu nút
        elif get_flood_prediction(n) > 40: node_colors.append('#e74c3c')
        else: node_colors.append('#3498db')
        
    nx.draw_networkx_nodes(G, pos, node_size=800, node_color=node_colors, edgecolors='white', linewidths=2)
    
    # 5. Nhãn
    label_pos = {k: (v[0], v[1] - 0.25) for k, v in pos.items()}
    nx.draw_networkx_labels(G, label_pos, font_size=8, font_weight='bold', 
                            bbox=dict(facecolor='white', alpha=0.8, edgecolor='none', boxstyle='round,pad=0.2'))

    # Legend
    from matplotlib.lines import Line2D
    legend_elements = [
        Line2D([0], [0], color='#e74c3c', lw=3, linestyle='dashed', label='Đường Ngập (AI Model > 40cm)'),
        Line2D([0], [0], color='#2ecc71', lw=4, label='Lộ Trình Thoát Hiểm'),
        Line2D([0], [0], marker='o', color='w', markerfacecolor='#f1c40f', markersize=10, label='Vị Trí Của Bạn'),
        Line2D([0], [0], marker='o', color='w', markerfacecolor='#8e44ad', markersize=10, label='Điểm Đến')
    ]
    plt.legend(handles=legend_elements, loc='upper left', fontsize=10)
    plt.title(f"HỆ THỐNG DẪN ĐƯỜNG THÔNG MINH (SỬ DỤNG REAL AI MODEL)\n{start_node} ➔ {end_node}", fontsize=16, fontweight='bold', color='#2c3e50')
    
    plt.axis('off')
    plt.tight_layout()
    plt.show()

# ======================================================
# 4. MENU CHỌN ĐỊA ĐIỂM
# ======================================================
if __name__ == "__main__":
    available_nodes = list(custom_pos.keys())
    
    while True:
        print("\n" + "="*40)
        print(" 🗺️  BẢN ĐỒ KHU VỰC AO SEN - VĂN QUÁN")
        print("="*40)
        
        half = (len(available_nodes) + 1) // 2
        for i in range(half):
            col1 = f"{i+1}. {available_nodes[i]}"
            col2 = ""
            if i + half < len(available_nodes):
                col2 = f"{i + half + 1}. {available_nodes[i + half]}"
            print(f"{col1:<30} {col2}")
            
        print("\nNhập '0' để thoát.")
        
        try:
            s_input = input("\n>>> Chọn ĐIỂM ĐI (số): ")
            if s_input == '0': break
            start_idx = int(s_input) - 1
            
            e_input = input(">>> Chọn ĐIỂM ĐẾN (số): ")
            if e_input == '0': break
            end_idx = int(e_input) - 1
            
            if 0 <= start_idx < len(available_nodes) and 0 <= end_idx < len(available_nodes):
                start_node = available_nodes[start_idx]
                end_node = available_nodes[end_idx]
                
                if start_node == end_node:
                    print("Điểm đi và đến trùng nhau!")
                else:
                    solve_routing(start_node, end_node)
            else:
                print("Lựa chọn không hợp lệ!")
                
        except ValueError:
            print("Vui lòng nhập số!")