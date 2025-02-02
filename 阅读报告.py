# 导入必要的模块
import cgi

# 定义数据
data = [
    {'书名': '三体', '作者': '刘慈欣', '出版社': '重庆出版社', '出版年份': '2008', '页数': '336'},
    {'书名': '白夜行', '作者': '东野圭吾', '出版社': '南海出版公司', '出版年份': '2008', '页数': '400'},
    {'书名': '追风筝的人', '作者': '卡勒德·胡赛尼', '出版社': '上海人民出版社', '出版年份': '2005', '页数': '362'}
]

# 创建HTML页面
print("Content-type:text/html\r\n\r\n")
print("<html>")
print("<head>")
print("<title>书籍列表</title>")
print("</head>")
print("<body>")
print("<h1>书籍列表</h1>")
print("<table>")
print("<tr>")
print("<th>书名</th>")
print("<th>作者</th>")
print("<th>出版社</th>")
print("<th>出版年份</th>")
print("<th>页数</th>")
print("</tr>")
for book in data:
    print("<tr>")
    print(f"<td>{book['书名']}</td>")
    print(f"<td>{book['作者']}</td>")
    print(f"<td>{book['出版社']}</td>")
    print(f"<td>{book['出版年份']}</td>")
    print(f"<td>{book['页数']}</td>")
    print("</tr>")
print("</table>")
print("</body>")
print("</html>")
