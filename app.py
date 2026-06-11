"""
================================================================================
  PERSONAL FINANCE MANAGEMENT SYSTEM — BACKEND (app.py)
  Built with Flask + SQLite
================================================================================

HOW THIS FILE IS ORGANIZED:
  1. Imports & Configuration
  2. Database Models (Users, Income, Expenditure, Investments)
  3. Database Initialization + Sample Data
  4. Authentication Routes  (/api/signup, /api/login, /api/logout)
  5. Data Routes            (/api/income, /api/expenditure, /api/investments, /api/analytics)
  6. App Entry Point

HOW FLASK CONNECTS TO SQLITE:
  - Flask uses SQLAlchemy (an ORM) to talk to the SQLite file.
  - When app starts, it creates a file called "finance.db" automatically.
  - Every API route reads/writes to that file using Python objects (no raw SQL needed).

HOW index.html CONNECTS TO FLASK:
  - The browser sends HTTP requests (fetch()) to routes like /api/login.
  - Flask responds with JSON data.
  - JavaScript reads that JSON and updates the UI.
================================================================================
"""

from flask import Flask, request, jsonify, session
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, date
import json
import os
import random

# ── 1. APP CONFIGURATION ──────────────────────────────────────────────────────
app = Flask(__name__)

# Secret key encrypts the session cookie (use environment variable in production!)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'fintrack-super-secret-2024-change-me')

# Database configuration - uses SQLite by default, can be overridden with DATABASE_URL
database_url = os.environ.get('DATABASE_URL', 'sqlite:///finance.db')
# Fix for Render PostgreSQL (if you ever switch from SQLite)
if database_url.startswith('postgres://'):
    database_url = database_url.replace('postgres://', 'postgresql://', 1)
app.config['SQLALCHEMY_DATABASE_URI'] = database_url
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Allow JavaScript from any origin to call our API (needed for Netlify ↔ backend)
CORS(app, supports_credentials=True, origins="*")

db = SQLAlchemy(app)

# ── 2. DATABASE MODELS ────────────────────────────────────────────────────────

class User(db.Model):
    """Stores registered users."""
    __tablename__ = 'users'
    id            = db.Column(db.Integer, primary_key=True)
    full_name     = db.Column(db.String(120), nullable=False)
    email         = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    created_at    = db.Column(db.DateTime, default=datetime.utcnow)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {'id': self.id, 'full_name': self.full_name, 'email': self.email}


class Income(db.Model):
    """Monthly income records per user."""
    __tablename__ = 'income'
    id         = db.Column(db.Integer, primary_key=True)
    user_id    = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    month      = db.Column(db.String(20), nullable=False)   # e.g. "January"
    year       = db.Column(db.Integer, nullable=False)
    amount     = db.Column(db.Float, nullable=False)
    source     = db.Column(db.String(100), default='Salary')
    date       = db.Column(db.String(20), nullable=False)   # "YYYY-MM-DD"
    growth_pct = db.Column(db.Float, default=0.0)

    def to_dict(self):
        return {
            'id': self.id, 'month': self.month, 'year': self.year,
            'amount': self.amount, 'source': self.source,
            'date': self.date, 'growth_pct': self.growth_pct
        }


class Expenditure(db.Model):
    """Expense records per user."""
    __tablename__ = 'expenditure'
    id       = db.Column(db.Integer, primary_key=True)
    user_id  = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    month    = db.Column(db.String(20), nullable=False)
    year     = db.Column(db.Integer, nullable=False)
    category = db.Column(db.String(100), nullable=False)
    amount   = db.Column(db.Float, nullable=False)
    date     = db.Column(db.String(20), nullable=False)

    def to_dict(self):
        return {
            'id': self.id, 'month': self.month, 'year': self.year,
            'category': self.category, 'amount': self.amount, 'date': self.date
        }


class Investment(db.Model):
    """Investment records per user."""
    __tablename__ = 'investments'
    id             = db.Column(db.Integer, primary_key=True)
    user_id        = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    name           = db.Column(db.String(150), nullable=False)
    type           = db.Column(db.String(50), nullable=False)   # Mutual Fund / Stock / FD / Gold / ETF / SIP
    invested_amt   = db.Column(db.Float, nullable=False)
    current_value  = db.Column(db.Float, nullable=False)
    invest_date    = db.Column(db.String(20), nullable=False)
    month          = db.Column(db.String(20), nullable=False)
    year           = db.Column(db.Integer, nullable=False)

    @property
    def profit_loss(self):
        return round(self.current_value - self.invested_amt, 2)

    @property
    def return_pct(self):
        if self.invested_amt == 0:
            return 0
        return round((self.profit_loss / self.invested_amt) * 100, 2)

    def to_dict(self):
        return {
            'id': self.id, 'name': self.name, 'type': self.type,
            'invested_amt': self.invested_amt, 'current_value': self.current_value,
            'invest_date': self.invest_date, 'month': self.month, 'year': self.year,
            'profit_loss': self.profit_loss, 'return_pct': self.return_pct
        }


# ── 3. SAMPLE DATA GENERATOR ──────────────────────────────────────────────────

MONTHS = ['January','February','March','April','May','June',
          'July','August','September','October','November','December']

EXPENSE_CATEGORIES = {
    'Rent': (18000, 18000),
    'Groceries': (4000, 6000),
    'Electricity Bill': (1200, 2200),
    'Water Bill': (300, 600),
    'Internet/WiFi': (800, 1200),
    'Mobile Recharge': (399, 799),
    'Fuel': (2000, 4000),
    'Transportation': (800, 1800),
    'Dining Out': (1500, 4000),
    'Shopping': (2000, 8000),
    'Entertainment': (500, 2500),
    'Medical Expenses': (500, 3000),
    'Insurance': (2500, 2500),
    'Education': (0, 2000),
    'Travel': (0, 12000),
    'Miscellaneous': (500, 2000),
}

INVESTMENTS_TEMPLATE = [
    ('Axis Bluechip Fund', 'Mutual Fund', 15000, 1.18),
    ('HDFC Nifty 50 ETF', 'ETF', 20000, 1.22),
    ('Reliance Industries', 'Stock', 25000, 1.31),
    ('Infosys Ltd', 'Stock', 18000, 1.09),
    ('SBI Gold Fund', 'Gold', 10000, 1.14),
    ('ICICI Bank FD', 'Fixed Deposit', 50000, 1.073),
    ('Mirae Asset ELSS', 'Mutual Fund', 12000, 1.26),
    ('Zerodha Nifty SIP', 'SIP', 5000, 1.19),
    ('Parag Parikh Flexi Cap', 'Mutual Fund', 8000, 1.33),
    ('Tata Digital India Fund', 'Mutual Fund', 10000, 1.41),
]

def generate_sample_data(user_id):
    """Creates 12 months of realistic income, expenditure, and investment data."""
    year = 2024
    base_salary = 85000.0

    for i, month_name in enumerate(MONTHS):
        # ── Income ──
        growth = round(random.uniform(-1.5, 4.5), 2)
        if i > 0:
            base_salary = base_salary * (1 + growth / 100)
        salary = round(base_salary + random.uniform(-2000, 2000), 2)
        income = Income(
            user_id=user_id, month=month_name, year=year,
            amount=salary, source='Monthly Salary',
            date=f'{year}-{i+1:02d}-01', growth_pct=growth if i > 0 else 0.0
        )
        db.session.add(income)

        # ── Expenditure ──
        for cat, (lo, hi) in EXPENSE_CATEGORIES.items():
            if lo == 0 and random.random() < 0.4:
                continue  # skip optional categories sometimes
            amt = round(random.uniform(lo, hi), 2)
            exp = Expenditure(
                user_id=user_id, month=month_name, year=year,
                category=cat, amount=amt,
                date=f'{year}-{i+1:02d}-{random.randint(1,28):02d}'
            )
            db.session.add(exp)

        # ── Investments (2-4 per month) ──
        picks = random.sample(INVESTMENTS_TEMPLATE, k=random.randint(2, 4))
        for name, inv_type, base_inv, multiplier in picks:
            invested = round(base_inv + random.uniform(-2000, 3000), 2)
            months_held = 12 - i
            growth_factor = 1 + (multiplier - 1) * (months_held / 12)
            current = round(invested * growth_factor, 2)
            inv = Investment(
                user_id=user_id, name=name, type=inv_type,
                invested_amt=invested, current_value=current,
                invest_date=f'{year}-{i+1:02d}-{random.randint(1,20):02d}',
                month=month_name, year=year
            )
            db.session.add(inv)

    db.session.commit()


def init_db():
    """Creates all tables and adds a demo user with 12-month sample data."""
    with app.app_context():
        db.create_all()
        # Only seed once
        if User.query.filter_by(email='demo@fintrack.com').first():
            return
        demo = User(full_name='Arjun Sharma', email='demo@fintrack.com')
        demo.set_password('Demo@1234')
        db.session.add(demo)
        db.session.commit()
        generate_sample_data(demo.id)
        print('✅  Database initialized with demo data.')
        print('   Email: demo@fintrack.com  |  Password: Demo@1234')


# ── 4. AUTHENTICATION ROUTES ──────────────────────────────────────────────────

@app.route('/api/signup', methods=['POST'])
def signup():
    """
    Receives: { full_name, email, password }
    Creates a new user, returns user info + sets session.
    """
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data received'}), 400

    full_name = data.get('full_name', '').strip()
    email     = data.get('email', '').strip().lower()
    password  = data.get('password', '')

    if not all([full_name, email, password]):
        return jsonify({'error': 'All fields are required'}), 400
    if len(password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters'}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({'error': 'Email already registered'}), 409

    user = User(full_name=full_name, email=email)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    # Generate sample data for the new user
    generate_sample_data(user.id)

    session['user_id'] = user.id
    return jsonify({'message': 'Account created successfully', 'user': user.to_dict()}), 201


@app.route('/api/login', methods=['POST'])
def login():
    """
    Receives: { email, password }
    Verifies credentials, sets session cookie.
    """
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data received'}), 400

    email    = data.get('email', '').strip().lower()
    password = data.get('password', '')

    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(password):
        return jsonify({'error': 'Invalid email or password'}), 401

    session['user_id'] = user.id
    return jsonify({'message': 'Login successful', 'user': user.to_dict()}), 200


@app.route('/api/logout', methods=['POST'])
def logout():
    """Clears the session."""
    session.pop('user_id', None)
    return jsonify({'message': 'Logged out successfully'}), 200


@app.route('/api/me', methods=['GET'])
def me():
    """Returns current logged-in user info."""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Not authenticated'}), 401
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    return jsonify({'user': user.to_dict()}), 200


# ── 5. DATA ROUTES ────────────────────────────────────────────────────────────

def get_current_user():
    """Helper: returns User object or None."""
    uid = session.get('user_id')
    return User.query.get(uid) if uid else None


@app.route('/api/income', methods=['GET'])
def get_income():
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Not authenticated'}), 401

    year = request.args.get('year', 2024, type=int)
    records = Income.query.filter_by(user_id=user.id, year=year)\
                          .order_by(Income.date).all()
    data = [r.to_dict() for r in records]

    # Summary calculations
    amounts = [r['amount'] for r in data]
    summary = {
        'total': round(sum(amounts), 2),
        'average': round(sum(amounts) / len(amounts), 2) if amounts else 0,
        'highest': max(amounts) if amounts else 0,
        'lowest': min(amounts) if amounts else 0,
        'highest_month': data[amounts.index(max(amounts))]['month'] if amounts else '',
        'lowest_month':  data[amounts.index(min(amounts))]['month'] if amounts else '',
    }
    return jsonify({'records': data, 'summary': summary}), 200


@app.route('/api/expenditure', methods=['GET'])
def get_expenditure():
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Not authenticated'}), 401

    year = request.args.get('year', 2024, type=int)
    records = Expenditure.query.filter_by(user_id=user.id, year=year)\
                               .order_by(Expenditure.date).all()
    data = [r.to_dict() for r in records]

    # Category totals
    cat_totals = {}
    for r in data:
        cat_totals[r['category']] = round(cat_totals.get(r['category'], 0) + r['amount'], 2)

    total = round(sum(cat_totals.values()), 2)
    summary = {'total': total, 'by_category': cat_totals}
    return jsonify({'records': data, 'summary': summary}), 200


@app.route('/api/investments', methods=['GET'])
def get_investments():
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Not authenticated'}), 401

    year = request.args.get('year', 2024, type=int)
    records = Investment.query.filter_by(user_id=user.id, year=year)\
                              .order_by(Investment.invest_date).all()
    data = [r.to_dict() for r in records]

    total_invested = round(sum(r['invested_amt'] for r in data), 2)
    total_current  = round(sum(r['current_value'] for r in data), 2)
    total_profit   = round(total_current - total_invested, 2)
    total_return   = round((total_profit / total_invested * 100), 2) if total_invested else 0

    # By type
    by_type = {}
    for r in data:
        t = r['type']
        if t not in by_type:
            by_type[t] = {'invested': 0, 'current': 0}
        by_type[t]['invested'] = round(by_type[t]['invested'] + r['invested_amt'], 2)
        by_type[t]['current']  = round(by_type[t]['current']  + r['current_value'], 2)

    summary = {
        'total_invested': total_invested,
        'total_current': total_current,
        'total_profit': total_profit,
        'total_return_pct': total_return,
        'by_type': by_type,
    }
    return jsonify({'records': data, 'summary': summary}), 200


@app.route('/api/analytics', methods=['GET'])
def get_analytics():
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Not authenticated'}), 401

    year = request.args.get('year', 2024, type=int)

    income_recs = Income.query.filter_by(user_id=user.id, year=year).all()
    exp_recs    = Expenditure.query.filter_by(user_id=user.id, year=year).all()
    inv_recs    = Investment.query.filter_by(user_id=user.id, year=year).all()

    total_income  = round(sum(r.amount for r in income_recs), 2)
    total_expense = round(sum(r.amount for r in exp_recs), 2)
    total_inv     = round(sum(r.invested_amt for r in inv_recs), 2)
    total_curr    = round(sum(r.current_value for r in inv_recs), 2)
    inv_profit    = round(total_curr - total_inv, 2)
    savings       = round(total_income - total_expense - total_inv, 2)
    savings_rate  = round((savings / total_income * 100), 2) if total_income else 0
    expense_ratio = round((total_expense / total_income * 100), 2) if total_income else 0
    inv_growth    = round((inv_profit / total_inv * 100), 2) if total_inv else 0
    net_worth     = round(savings + total_curr, 2)

    # Monthly breakdown for charts
    monthly = {}
    for m in MONTHS:
        monthly[m] = {'income': 0, 'expense': 0, 'investment': 0}

    for r in income_recs:
        monthly[r.month]['income'] = round(monthly[r.month]['income'] + r.amount, 2)
    for r in exp_recs:
        monthly[r.month]['expense'] = round(monthly[r.month]['expense'] + r.amount, 2)
    for r in inv_recs:
        monthly[r.month]['investment'] = round(monthly[r.month]['investment'] + r.invested_amt, 2)

    return jsonify({
        'total_income': total_income,
        'total_expense': total_expense,
        'total_invested': total_inv,
        'total_current_value': total_curr,
        'investment_profit': inv_profit,
        'savings': savings,
        'savings_rate': savings_rate,
        'expense_ratio': expense_ratio,
        'investment_growth_rate': inv_growth,
        'net_worth': net_worth,
        'monthly_breakdown': monthly,
    }), 200


# ── 6. ROOT ROUTE (Fixes Render 404) ─────────────────────────────────────────

@app.route('/')
def home():
    """Returns API status - prevents Render from returning 404 on health check."""
    return jsonify({
        "status": "success",
        "message": "FinTrack API is running",
        "version": "1.0.0",
        "endpoints": [
            "/api/signup",
            "/api/login",
            "/api/logout",
            "/api/me",
            "/api/income",
            "/api/expenditure",
            "/api/investments",
            "/api/analytics"
        ]
    })


# ── 7. ENTRY POINT (Fixed for Production) ─────────────────────────────────────

if __name__ == '__main__':
    init_db()
    port = int(os.environ.get('PORT', 5000))
    print(f'\n🚀  Starting FinTrack API server on port {port}...')
    print('   API base URL: http://0.0.0.0:' + str(port) + '/api')
    print('   Health check: http://0.0.0.0:' + str(port) + '/')
    # Use host='0.0.0.0' to accept connections from outside (required for Render)
    # Use debug=False for production
    app.run(host='0.0.0.0', port=port, debug=False)
