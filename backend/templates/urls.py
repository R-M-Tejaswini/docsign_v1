from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import TemplateViewSet, TemplateGroupViewSet

app_name = 'templates'

# Router for viewsets
router = DefaultRouter()
router.register(r'template-groups', TemplateGroupViewSet, basename='template-group')

urlpatterns = [
    # Template CRUD
    path('', TemplateViewSet.as_view({
        'get': 'list',
        'post': 'create'
    }), name='template-list'),
    
    path('<int:pk>/', TemplateViewSet.as_view({
        'get': 'retrieve',
        'patch': 'partial_update',
        'delete': 'destroy'
    }), name='template-detail'),
    
    # Template recipients
    path('<int:pk>/recipients/', TemplateViewSet.as_view({
        'get': 'recipients'
    }), name='template-recipients'),
    
    # Template fields
    path('<int:pk>/fields/', TemplateViewSet.as_view({
        'post': 'fields'
    }), name='template-field-create'),
    
    path('<int:pk>/fields/<int:field_id>/', TemplateViewSet.as_view({
        'patch': 'field_detail',
        'delete': 'field_detail'
    }), name='template-field-detail'),

    # Template Groups - Router URLs
    path('', include(router.urls)),
]