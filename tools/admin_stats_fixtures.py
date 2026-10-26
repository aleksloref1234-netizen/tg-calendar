"""Synthetic statistics for local UI QA only; no production records."""
from datetime import datetime, timedelta, timezone


def statistics(path, user_id):
    today = datetime.now(timezone(timedelta(hours=3))).date()
    updated = today.strftime("%d.%m.%Y") + " 18:00"
    admins = [
        dict(telegram_id=user_id, nickname="Demo_Admin", role="Следящий", group_header="МОДЕРАТОРЫ", zone="green", stability_index=91.8, reduced_norm=True, norm_percent=100, help_rating=4.7),
        dict(telegram_id=202, nickname="Demo_Review", role="Старший следящий", group_header="СТАРШИЕ МОДЕРАТОРЫ", zone="yellow", stability_index=72.5, reduced_norm=False, norm_percent=80, help_rating=3.8),
        dict(telegram_id=303, nickname="Demo_Attention", role="Следящий", group_header="МОДЕРАТОРЫ", zone="red", stability_index=48, reduced_norm=False, norm_percent=50, help_rating=3.1),
    ]
    for admin in admins:
        admin.update(attendance_percent=100, reprimands=0, warnings=1, promotion_percent=67, complaint_percent=0, violation_active=0, violation_index_impact=0, risk_factors=[])
    if path == "/api/admin/overview":
        return dict(total=3, admins=admins, average_stability=70.8, red_count=1, yellow_count=1, green_count=1, reduced_norm_count=1, attention=[{**admins[2], "factors":["Норматив ниже 60%"]}], weekly_norm_series=[dict(label=label,value=value) for label,value in zip(["Пн","Вт","Ср","Чт","Пт","Сб","Вс"],[82,91,78,100,88,95,100])], team_metrics=dict(norm_percent=76.7,help_rating=3.9,attendance_percent=100,discipline_percent=90,quality_score=90), updated_at=updated, feature_access={"admin_task_marketplace":False})
    if path == "/api/norms":
        return dict(admins=[dict(telegram_id=admin["telegram_id"],nickname=admin["nickname"],locked=False,check=None,norm=dict(title=admin["role"],source="ТЕСТОВЫЕ ДАННЫЕ",reports=30 if admin["reduced_norm"] else 60,minutes=60 if admin["reduced_norm"] else 120,events=1 if admin["reduced_norm"] else 2,reactions=10 if admin["reduced_norm"] else 20,partial_reports_deficit=15 if admin["reduced_norm"] else 30,partial_minutes_deficit=15 if admin["reduced_norm"] else 30,dynamic_discount=dict(applied=admin["reduced_norm"],stability_index=admin["stability_index"],days_on_role=25,weekly_complaints=0,weekly_similar_complaints=0),base_norm=dict(reports=60,minutes=120,events=2,reactions=20))) for admin in admins],summary=dict(total=3,checked=0,locked=0),over_norm=dict(threshold_reports=250,bonus_reports=200),event_bonus=dict(starts_after=2,reports_per_event=50))
    if path.startswith(("/api/dashboard/", "/api/admin/dashboard/")):
        target = int(path.rsplit("/",1)[1])
        admin = next((item for item in admins if item["telegram_id"] == target), admins[0])
        return dict(**{key:admin[key] for key in ["nickname","role","group_header","reprimands","warnings"]}, reports_week=280, days_on_role=25, reports_left=120, days_left=4, days_without_norm=0, activity_coef=100, meeting_percent="100%", reports_daily=[20,60,50,70,40,40,0], promotion={"progress":67}, reduced_norm=dict(available=True,active=admin["reduced_norm"],category_title="Модератор",effective_norm=dict(reports=30,minutes=60,events=1,reactions=10)), performance_index=dict(has_data=True,value=admin["stability_index"],zone=admin["zone"],help_rating=admin["help_rating"],components=[dict(key=key,score_percent=percent,points=round(maximum*percent/100,1),max_points=maximum,available=True) for key,maximum,percent in [("norm",40,89),("rating",25,94),("meetings",20,100),("discipline",10,100),("violations",5,54)]]), test_results={"has_results":False}, complaint_repeat={"has_data":False}, feature_access={"admin_task_marketplace":False})
    if path == "/api/inactive/overview":
        cards=[]
        for i,admin in enumerate(admins):
            cards.append({**admin,"inactive_count":i+1,"free_count":2,"absence_days":i+3,"last_period":"25.10–26.10","is_absent_now":i==0,"current_type":"Освобождение","current_start":today.isoformat(),"current_end":(today+timedelta(days=1)).isoformat(),"current_until":(today+timedelta(days=1)).strftime("%d.%m.%Y"),"history":[dict(type="Освобождение",period="25.10–26.10",duration=2),dict(type="Неактив",period="20.10",duration=1)]})
        return dict(admins=cards,today=today.isoformat(),total_admins=3,current_absent_count=1,current_inactive_count=0,current_free_count=1,ending_today_count=0,applications_this_week=3,average_duration=1.7,red_count=1,yellow_count=1,attention=[dict(nickname="Demo_Attention",zone="red",message="Превышен недельный лимит",label="Нужен контроль")],schedule=cards[:1],weekly_series=[dict(label=f"{i+1:02}.10",inactive=i%3+1,free=2) for i in range(8)],updated_at=updated)
    return None
